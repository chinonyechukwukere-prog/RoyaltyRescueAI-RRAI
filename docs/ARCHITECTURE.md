# System Architecture Document
# Royalty Rescue AI (RRAI)
### Version 1.7 — Revised Draft for Review
### Prepared by: IBM Bob, per Chinonye V. Chukwukere (Founder & Product Lead)
### Aligned to: PRD v1.3
### Internal Deadline: December 3, 2026
### Revision: Quality review applied per Product Lead instruction — see Change Log (§15)

---

> **Document Status:** Draft — pending team review and approval before implementation begins.
> This document defines what the system is made of and how it behaves — it does not authorize or contain application code.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [System Components](#2-system-components)
3. [Data Architecture](#3-data-architecture)
4. [API Design and Contracts](#4-api-design-and-contracts)
5. [Hospital Eligibility Validation Service](#5-hospital-eligibility-validation-service)
6. [AI Copilot Integration](#6-ai-copilot-integration)
7. [Authentication and Authorization](#7-authentication-and-authorization)
8. [Incident Lifecycle and State Machine](#8-incident-lifecycle-and-state-machine)
9. [Post-Acceptance Hospital Status Safety Control](#9-post-acceptance-hospital-status-safety-control)
10. [Audit Log Architecture](#10-audit-log-architecture)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Security Controls](#12-security-controls)
13. [MVP vs. Future Roadmap Boundaries](#13-mvp-vs-future-roadmap-boundaries)
14. [Outstanding Actions](#14-outstanding-actions)

---

## 1. Architecture Overview

RRAI is a multi-tenant, server-rendered web application with a REST API backend, a PostgreSQL relational database, and an IBM watsonx.ai-powered AI copilot. All consequential coordination actions are human-approved. The AI copilot retrieves and ranks hospital options; a server-side hospital eligibility validation service enforces data integrity before any recommendation reaches the agent.

### High-Level Component Map

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                         │
│  Citizen Portal │ Agent Dashboard │ Hospital Admin │ Org Admin│
│              Next.js 14 (App Router) + Tailwind + shadcn/ui  │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│                      API LAYER (Next.js API Routes)         │
│  Auth Middleware │ Org Scoping Middleware │ Route Handlers   │
│  /incidents  /hospitals  /copilot  /dispatch  /handover     │
│  /audit  /organizations  /webhooks                          │
└──────┬───────────────┬──────────────────┬───────────────────┘
       │               │                  │
┌──────▼──────┐ ┌──────▼──────┐  ┌───────▼────────────────┐
│  Supabase   │ │  Hospital   │  │  IBM watsonx.ai         │
│  PostgreSQL │ │  Eligibility│  │  Granite 3.x LLM        │
│  + Auth     │ │  Validation │  │  RAG / Document Index   │
│             │ │  Service    │  │                         │
└─────────────┘ └─────────────┘  └─────────────────────────┘
```

### Architectural Principles

| Principle | Implementation |
|---|---|
| **Human-in-the-loop** | Every consequential action requires an explicit human API call; no state machine transition is triggered by AI alone |
| **AI as retrieval, not decision** | The AI copilot suggests; the backend validates; the human approves |
| **Server-side enforcement** | RBAC, org scoping, and hospital eligibility are enforced in API middleware and service layers — never in UI state alone |
| **Append-only audit** | The audit log table has no UPDATE or DELETE permissions granted to any application role |
| **Data isolation by design** | Every database query is scoped by `organization_id`; cross-org access requires explicit authorization |
| **Fail safe** | If validation fails or no eligible hospital exists, the system surfaces a human escalation path — it never silently degrades to an ineligible recommendation |

---

## 2. System Components

### 2.1 Frontend — Next.js 14 Application

| Interface | Primary Users | Key Screens |
|---|---|---|
| **Citizen Portal** | Public (unauthenticated) | Emergency intake form, submission confirmation |
| **Agent Dashboard** | Response Agents | Incident list, incident detail, AI copilot panel, dispatch controls, handover generation |
| **Hospital Admin Portal** | Hospital Administrators | Availability status update, patient acceptance, incoming handover summary |
| **Organization Admin Panel** | Org Administrators (read-only MVP) | Organization profile, user list with roles |

**Technology choices:**
- **Next.js 14 App Router** — server components for secure data fetching; client components for interactive panels (copilot, status updates)
- **Tailwind CSS + shadcn/ui** — accessible component library; no custom design system overhead
- **i18n via `next-intl`** — translation key architecture; English + Pidgin phrase files for MVP; structure supports future language additions without component changes

### 2.2 Backend — Next.js API Routes

All API routes live within the same Next.js application. Each route applies middleware layers before executing business logic:

1. **Auth Middleware** — verifies Supabase JWT; rejects unauthenticated requests (except `/api/incidents` POST and `/api/webhooks/112`)
2. **Org Scoping Middleware** — extracts `organization_id` from the verified JWT claims; injects it into all downstream database queries. Applies to all authenticated routes.
3. **Citizen Request Routing** — `POST /api/incidents` (unauthenticated) does not carry an org JWT. Incident routing to an organization is determined server-side by a configurable routing rule: all citizen portal submissions are assigned to the designated independent operator organization (Org A — RapidResponse NG) for the MVP. The routing rule is stored in server configuration, not derived from the request body. The citizen is never aware of organization assignment; no organization identity is exposed to the public portal. See §7.5 for full routing design.

### 2.3 Database — PostgreSQL via Supabase

Supabase provides:
- Managed PostgreSQL instance
- Row-Level Security (RLS) policies as a secondary isolation layer (primary enforcement is in the API layer)
- Supabase Auth for JWT issuance and session management
- Real-time subscriptions for incident status updates to the agent dashboard

### 2.4 Hospital Eligibility Validation Service

A dedicated internal service (not an external microservice — implemented as a TypeScript module invoked by the `/api/copilot` route). Full specification in §5.

### 2.5 IBM watsonx.ai Integration

- **Model:** IBM Granite 3.x (instruction-tuned)
- **Pattern:** Retrieval-Augmented Generation — the model receives a structured context block containing retrieved hospital registry records, then generates a ranked recommendation with rationale
- **Integration point:** Called only from the `/api/copilot` route, after the Hospital Eligibility Validation Service has pre-filtered the candidate set
- Full specification in §6.

### 2.6 Mock 112 Integration Endpoint (Conditional — F11)

A single `/api/webhooks/112` POST endpoint that accepts a structured JSON incident payload, creates an incident record attributed to Org B, and triggers the same agent dashboard workflow as a citizen-submitted request. Implemented only if Weeks 1–3 are on schedule.

---

## 3. Data Architecture

### 3.1 Core Entity Relationship

```
organizations
    │
    ├── users (org_id FK)
    ├── incidents (org_id FK)
    │       ├── copilot_interactions (incident_id FK)
    │       ├── dispatch_assignments (incident_id FK)
    │       ├── handover_summaries (incident_id FK)
    │       └── audit_log_entries (incident_id FK)
    └── ambulance_units (org_id FK)

hospitals (shared across organizations — read by all, written only by hospital_admins)
    ├── hospital_capability_profiles (hospital_id FK)
    ├── hospital_availability_updates (hospital_id FK)
    ├── patient_acceptance_records (hospital_id FK, incident_id FK)
    └── hospital_audit_log_entries (hospital_id FK)
```

### 3.2 Key Table Schemas

#### `organizations`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT | e.g. "RapidResponse NG" |
| `type` | ENUM | `independent` / `national_partner` |
| `status` | ENUM | `active` / `suspended` |
| `created_at` | TIMESTAMPTZ | |

#### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Matches Supabase Auth user ID |
| `organization_id` | UUID FK → organizations | |
| `role` | ENUM | `response_agent` / `hospital_admin` / `ambulance_dispatcher` / `org_admin` |
| `name` | TEXT | |
| `email` | TEXT | |
| `is_active` | BOOLEAN | |

#### `incidents`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Reference number shown to citizen |
| `organization_id` | UUID FK → organizations | Enforces org scoping |
| `status` | ENUM | See §8 for full state machine |
| `source_type` | ENUM | `citizen_portal` / `mock_integration` |
| `caller_name` | TEXT | Synthetic |
| `caller_phone` | TEXT | Synthetic |
| `location_description` | TEXT | |
| `lga` | TEXT | Local Government Area |
| `emergency_type` | TEXT | e.g. "cardiac", "trauma" |
| `presenting_complaint` | TEXT | Free text from citizen form |
| `persons_affected` | INTEGER | |
| `preferred_language` | TEXT | ISO tag or custom enum |
| `language_assistance_required` | BOOLEAN | Agent-set flag |
| `assigned_agent_id` | UUID FK → users | |
| `selected_hospital_id` | UUID FK → hospitals | Set on hospital selection |
| `triage_priority` | ENUM | `immediate` / `urgent` / `delayed` / `expectant` — agent-assigned |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

#### `hospitals`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT | Fictional |
| `address` | TEXT | |
| `lga` | TEXT | |
| `state` | TEXT | |
| `geographic_zone` | TEXT | e.g. "Lagos Mainland" |
| `phone` | TEXT | Fictional |
| `email` | TEXT | Fictional |

#### `hospital_capability_profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `hospital_id` | UUID FK → hospitals | One active profile per hospital |
| `availability_status` | ENUM | `confirmed` / `unavailable` / `pending_confirmation` / `outdated` |
| `ed_operating_status` | ENUM | `open` / `limited` / `closed` |
| `staff_disruption_flag` | BOOLEAN | True if strike or walkout active |
| `disruption_notes` | TEXT | |
| `specialties_on_duty` | TEXT[] | Array of specialty strings |
| `accepted_emergency_types` | TEXT[] | Array: "cardiac", "trauma", etc. |
| `emergency_beds_available` | INTEGER | |
| `icu_beds_available` | INTEGER | |
| `imaging_available` | TEXT[] | "xray", "ct", "mri" |
| `blood_bank_available` | BOOLEAN | |
| `ventilators_available` | INTEGER | |
| `emergency_stabilization_capable` | BOOLEAN | |
| `last_verified_at` | TIMESTAMPTZ | |
| `verified_by_user_id` | UUID FK → users | Hospital admin who verified |
| `verification_source` | TEXT | |
| `outdated_threshold_hours` | INTEGER | Default 4 |
| `updated_at` | TIMESTAMPTZ | |

> **Computed field (not stored):** `is_outdated` = `last_verified_at < NOW() - INTERVAL '4 hours'`. Evaluated at query time; the `availability_status` column is updated to `outdated` by a scheduled background job or on-read check.

#### `patient_acceptance_records`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `incident_id` | UUID FK → incidents | |
| `hospital_id` | UUID FK → hospitals | |
| `accepted_by_user_id` | UUID FK → users | Must be a `hospital_admin` |
| `accepted_at` | TIMESTAMPTZ | |
| `notes` | TEXT | Optional |
| `operationally_valid` | BOOLEAN | `true` when accepted; set to `false` by system when hospital becomes ineligible after acceptance. The record is **never deleted** — it is retained as immutable historical evidence. |
| `invalidated_at` | TIMESTAMPTZ | Timestamp when `operationally_valid` was set to `false`; null if still valid |
| `invalidated_reason` | TEXT | Reason for invalidation (e.g. `"hospital_status_changed_to_unavailable"`); null if still valid |

> **Immutability principle:** Patient acceptance records are never deleted. The `operationally_valid` flag distinguishes current operational status from historical evidence. The original `accepted_at`, `accepted_by_user_id`, and `hospital_id` values are always preserved in full. The audit log records who made the acceptance and when; the `operationally_valid` flag records whether that acceptance is still active. Both are independently queryable.

#### `audit_log_entries`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `incident_id` | UUID FK → incidents | Nullable for org-level actions |
| `organization_id` | UUID FK → organizations | |
| `actor_id` | UUID FK → users | Nullable for system-generated entries |
| `actor_role` | TEXT | Copied at write time; not a live FK |
| `action_type` | TEXT | Enum-like string; see §10 |
| `source` | ENUM | `human` / `ai_suggestion` / `system` |
| `entity_type` | TEXT | e.g. "incident", "hospital", "dispatch" |
| `entity_id` | UUID | |
| `detail` | JSONB | Action-specific payload |
| `created_at` | TIMESTAMPTZ | |

> **Enforcement:** No `UPDATE` or `DELETE` privilege is granted to the application database role (`rrai_app`) on `audit_log_entries`. Inserts only. See §10.1a for full database role design.
>
> **Note on `patient_acceptance_records` mutability:** Unlike `audit_log_entries`, the `patient_acceptance_records` table does permit a targeted `UPDATE` of the `operationally_valid`, `invalidated_at`, and `invalidated_reason` columns — but only by the `rrai_app` role acting on behalf of the system safety control (§9), never by user-facing API calls. The original acceptance data (`accepted_by_user_id`, `accepted_at`, `hospital_id`) is never overwritten. The audit log entry for `patient_acceptance_voided` is the immutable record of this event.

---

## 4. API Design and Contracts

All API routes follow REST conventions. All responses use JSON. All routes except those listed return `401 Unauthorized` for unauthenticated requests.

### Route Index

| Method | Route | Auth Required | Description |
|---|---|---|---|
| POST | `/api/incidents` | No (citizen portal) | Submit new emergency request |
| GET | `/api/incidents` | Agent / Org Admin | List incidents (org-scoped) |
| GET | `/api/incidents/:id` | Agent / Org Admin | Get incident detail |
| PATCH | `/api/incidents/:id/status` | Agent | Update incident status |
| POST | `/api/copilot/query` | Agent | Query AI copilot |
| GET | `/api/hospitals` | Agent | Search hospital registry (read) |
| GET | `/api/hospitals/:id` | Agent / Hospital Admin | Get hospital capability profile |
| PUT | `/api/hospitals/:id/availability` | Hospital Admin | Update availability status |
| POST | `/api/hospitals/:id/acceptance` | Hospital Admin | Submit patient acceptance |
| GET | `/api/dispatch/units` | Agent / Dispatcher | List available ambulance units |
| POST | `/api/dispatch/assign` | Agent / Dispatcher | Assign ambulance to incident |
| PATCH | `/api/dispatch/:id/status` | Agent / Dispatcher | Update dispatch status |
| POST | `/api/handover` | Agent | Generate handover summary |
| PATCH | `/api/handover/:id/acknowledge` | Hospital Admin | Acknowledge handover receipt |
| GET | `/api/audit/:incidentId` | Agent / Org Admin | Get audit log for incident |
| GET | `/api/organizations/:id` | Org Admin | Get organization profile |
| GET | `/api/organizations/:id/users` | Org Admin | List org users (read-only) |
| POST | `/api/webhooks/112` | Webhook secret | Receive mock 112 incident (F11) |

### Key Request/Response Shapes

#### `POST /api/incidents` — Citizen intake
```json
Request:
{
  "caller_name": "string",
  "caller_phone": "string",
  "location_description": "string",
  "lga": "string",
  "emergency_type": "string",
  "presenting_complaint": "string",
  "persons_affected": 1,
  "preferred_language": "en",
  "consent_given": true
}

Response 201:
{
  "incident_id": "uuid",
  "reference_number": "RRAI-20261106-0001",
  "status": "new",
  "message": "Your emergency request has been received."
}
```

#### `POST /api/copilot/query` — AI copilot query
```json
Request:
{
  "incident_id": "uuid",
  "query_text": "Which hospitals near Ikeja have cardiac emergency capacity?"
}

Response 200:
{
  "query_id": "uuid",
  "validated_recommendations": [
    {
      "hospital_id": "uuid",
      "hospital_name": "string",
      "availability_status": "confirmed",
      "last_verified_at": "ISO8601",
      "accepted_emergency_types": ["cardiac", "trauma"],
      "ai_rationale": "string — labeled as AI-suggested",
      "validation_passed": true
    }
  ],
  "excluded_hospitals": [
    {
      "hospital_id": "uuid",
      "hospital_name": "string",
      "exclusion_reason": "outdated | unavailable | capability_mismatch | not_found"
    }
  ],
  "escalation_required": false,
  "escalation_message": null
}

Response 200 (no eligible hospital):
{
  "validated_recommendations": [],
  "excluded_hospitals": [...],
  "escalation_required": true,
  "escalation_message": "No hospitals with confirmed availability match the required emergency type. Human escalation is required. Suggested actions: [...]"
}
```

#### `POST /api/hospitals/:id/acceptance` — Patient acceptance
```json
Request:
{
  "incident_id": "uuid",
  "notes": "string (optional)"
}

Response 201:
{
  "acceptance_id": "uuid",
  "hospital_id": "uuid",
  "incident_id": "uuid",
  "accepted_by": "user display name",
  "accepted_at": "ISO8601"
}

Error 422 (hospital ineligible — blocking, no override):
{
  "error": "ACCEPTANCE_BLOCKED_INELIGIBLE",
  "reason": "This hospital is not eligible to accept patients. Current status: [unavailable|outdated|pending_confirmation]. ED status: [closed]. Staff disruption: [true]. Acceptance is not permitted.",
  "override_allowed": false
}
```

> **No override path for ineligible hospitals.** A hospital with `unavailable`, `outdated`, or `pending_confirmation` availability status, or with `ed_operating_status: "closed"`, or with `staff_disruption_flag: true` cannot accept patients. There is no override mechanism. The agent must re-verify or escalate. This removes the `override_allowed: true` pattern present in v1.0 and aligns with PRD F6.1 and the safety constraints in §7.

#### `POST /api/dispatch/assign` — Ambulance dispatch
```json
Request:
{
  "incident_id": "uuid",
  "unit_id": "uuid"
}

Error 422 (missing acceptance):
{
  "error": "DISPATCH_BLOCKED",
  "reason": "No patient acceptance record exists for this incident and hospital. Dispatch cannot proceed.",
  "required_action": "Obtain hospital patient acceptance before dispatching."
}
```

---

## 5. Hospital Eligibility Validation Service

This is the primary safeguard against AI hallucination and ineligible hospital recommendations. It is implemented as a server-side TypeScript module invoked at two points in the copilot pipeline: (a) as a pre-filter before the AI model is called, and (b) as a post-filter validating the AI model's output before it is returned to the client. Both passes use the same validation logic. This dual-pass design ensures the AI model only receives eligible hospitals in its context and that any hospital the model outputs is re-verified before display.

### 5.1 Purpose

Ensure that every hospital recommendation returned to a response agent has been independently verified against the authoritative hospital registry — regardless of what the AI model generated. Clinical capability, capacity, staffing, operating status, and verification freshness are evaluated together as a composite eligibility decision.

### 5.2 Unified Validation Sequence (Applied at Both Pre-Filter and Post-Filter)

All five checks are applied to each hospital candidate as a single composite evaluation. A hospital must pass **all five checks** to be considered eligible. Failure at any check excludes the hospital and records the specific reason.

```
For each candidate hospital:
           │
           ▼
Check 1: Hospital ID Existence
  → Query hospitals table by ID
  → FAIL: ID not found in registry → EXCLUDE (reason: "not_found")
           │ PASS
           ▼
Check 2: Verification Timestamp Freshness
  → Compute: last_verified_at < NOW() - OUTDATED_THRESHOLD_HOURS
  → FAIL: stale → write availability_status = "outdated" to DB
        → EXCLUDE (reason: "outdated_on_read")
  → PASS only if last_verified_at is within threshold
           │ PASS
           ▼
Check 3: Availability Status
  → Read availability_status from hospital_capability_profiles
  → Must be exactly "confirmed"
  → FAIL: "unavailable" | "pending_confirmation" | "outdated" → EXCLUDE
        (reason: matches status value)
           │ PASS
           ▼
Check 4: Emergency Capability Match
  → Compare incident.emergency_type against accepted_emergency_types[]
  → FAIL: emergency_type not present in array → EXCLUDE (reason: "capability_mismatch")
           │ PASS
           ▼
Check 5: Composite Operational Readiness
  → Check A: ed_operating_status must be "open" or "limited" — not "closed"
           → FAIL → EXCLUDE (reason: "ed_closed")
  → Check B: staff_disruption_flag must be false
           → FAIL → EXCLUDE (reason: "staff_disruption")
  → Check C: emergency_beds_available > 0 OR icu_beds_available > 0
           → FAIL → EXCLUDE (reason: "insufficient_capacity")
  → All three sub-checks must pass
           │ ALL PASS
           ▼
Hospital is ELIGIBLE — added to validated_recommendations

──────────────────────────────────────────────────
After all candidates evaluated:

→ validated_recommendations: hospitals that passed all 5 checks
→ excluded_hospitals: list with per-hospital exclusion reason
→ escalation_required: true if validated_recommendations is empty
```

### 5.3 Escalation Response

When `escalation_required` is `true`, the service returns a structured escalation object:

```json
{
  "escalation_required": true,
  "escalation_message": "No hospitals with confirmed availability match the required emergency type for this incident.",
  "excluded_count": 4,
  "exclusion_summary": {
    "unavailable": 2,
    "outdated": 1,
    "capability_mismatch": 1
  },
  "suggested_actions": [
    "Contact hospitals directly using emergency contact numbers.",
    "Request manual availability verification from hospital administrators.",
    "Escalate to supervisor for alternative coordination."
  ]
}
```

### 5.4 Error Handling

| Condition | Behavior |
|---|---|
| Registry database unreachable | Return error to agent: "Hospital registry temporarily unavailable. Manual coordination required." Log system error to audit. |
| AI model returns empty candidate list | Skip validation; return escalation response directly. |
| AI model returns malformed response | Log error; return escalation response. Do not surface raw AI error to agent. |
| Partial validation failure (some pass, some fail) | Return passing hospitals as recommendations; include excluded list. Escalation only if zero pass. |

### 5.5 Negative Test Cases (Required)

| Test | Expected Behavior |
|---|---|
| All candidate hospitals have status `unavailable` | `validated_recommendations: []`, `escalation_required: true` |
| Candidate hospital status is `outdated` | Excluded; `outdated` status written to DB; escalation if no others pass |
| No candidate hospital matches incident emergency type | All excluded with `capability_mismatch`; escalation returned |
| AI generates hospital ID not in registry | Excluded with `not_found`; audit entry created |
| Hospital has `confirmed` status but `emergency_beds_available: 0` and `icu_beds_available: 0` | Excluded with `insufficient_capacity` |
| Hospital has `confirmed` status but `ed_operating_status: "closed"` | Excluded with `ed_closed` |
| Hospital has `confirmed` status but `staff_disruption_flag: true` | Excluded with `staff_disruption` |
| Registry database error during validation | Error returned to agent; escalation message displayed; system error logged |

---

## 6. AI Copilot Integration

### 6.1 Integration Flow

The copilot pipeline applies eligibility validation **twice**: once before calling the AI model (pre-filter), and once after (post-filter). This ensures the model only reasons over verified eligible hospitals, and that any output it generates is independently re-validated before display.

```
Agent submits query text + incident_id
           │
           ▼
/api/copilot/query route handler
           │
           ├─► Step 1 — Fetch incident record
           │     (emergency_type, lga, triage_priority)
           │
           ├─► Step 2 — PRE-FILTER: Hospital Eligibility Validation Service (§5)
           │     Query hospital registry scoped to incident LGA
           │     Apply all 5 eligibility checks to each hospital
           │     → eligible_hospital_set: hospitals passing all 5 checks
           │     If eligible_hospital_set is empty:
           │       → Skip AI call entirely
           │       → Return escalation response to client
           │       → Log audit entry: copilot_escalation_no_eligible_hospitals
           │
           ├─► Step 3 — Format AI context block
           │     Only eligible_hospital_set hospitals are included
           │     Context includes per-hospital: name, LGA, accepted emergency
           │     types, availability status, last_verified_at, brief capability
           │     summary. No ineligible hospital data is passed to the model.
           │
           ├─► Step 4 — Call IBM watsonx.ai Granite 3.x
           │     Prompt: rank eligible hospitals for this incident, cite name
           │     and rationale, indicate if none are suitable
           │
           ├─► Step 5 — Parse AI response
           │     Extract ranked hospital list and per-hospital rationale text
           │
           ├─► Step 6 — POST-FILTER: Hospital Eligibility Validation Service (§5)
           │     Re-apply all 5 eligibility checks to AI-named hospitals
           │     Cross-reference AI-named hospitals against eligible_hospital_set
           │     Any hospital named by AI not in eligible_hospital_set → excluded
           │     Log audit entry: hospital_validation_excluded (for each exclusion)
           │     If all AI-named hospitals are excluded:
           │       → Return escalation response
           │
           └─► Step 7 — Assemble and return validated response to client
                 validated_recommendations, excluded_hospitals,
                 escalation_required, escalation_message
```

### 6.2 Prompt Design Principles

- The system prompt instructs the model to: rank hospitals from the provided context only, cite the hospital name and availability status, state the rationale in one sentence per hospital, and indicate if no eligible hospital exists.
- The model is explicitly instructed not to generate hospital names, addresses, or capabilities that are not present in the provided context block.
- The model's output is treated as unverified candidate text — the Validation Service (§5) is the authoritative filter, not the prompt.

### 6.3 IBM watsonx.ai API Contract

| Parameter | Value |
|---|---|
| Endpoint | `https://us-south.ml.cloud.ibm.com/ml/v1/text/generation` |
| Model ID | `ibm/granite-3-8b-instruct` (or available equivalent) |
| Max tokens | 1024 |
| Temperature | 0.1 (low, for factual retrieval tasks) |
| Authentication | IBM Cloud IAM bearer token |

> **Note:** Exact model ID and endpoint must be confirmed against the IBM watsonx.ai service catalog available to the team's IBM Cloud account at implementation time.

### 6.4 Labeling Requirements

Every element of the copilot response displayed in the UI must be labeled at the point of rendering:

| Content Type | Label |
|---|---|
| AI-generated rationale text | Badge: "AI Suggested" |
| Registry-retrieved fact (status, timestamp, capabilities) | Badge: "Registry Data" |
| Human-confirmed decision | Badge: "Agent Confirmed" |
| System escalation prompt | Badge: "Escalation Required" |

---

## 7. Authentication and Authorization

### 7.1 Authentication — Supabase Auth

- All user sessions are authenticated via Supabase Auth (JWT-based).
- The citizen intake portal does not require authentication.
- The mock 112 webhook (`/api/webhooks/112`) is authenticated via a shared webhook secret in the request header — no user session required.
- All other routes require a valid Supabase JWT in the `Authorization: Bearer` header.

### 7.5 Citizen Request Organization Routing

Citizen portal submissions (`POST /api/incidents`) are unauthenticated. They do not carry an `organization_id`. The routing design preserves Org A / Org B data isolation by assigning the organization server-side, not from the request:

**MVP routing rule:**
- All citizen portal submissions are routed to Org A (RapidResponse NG) by default.
- The `DEFAULT_CITIZEN_ORG_ID` environment variable holds Org A's UUID. It is set in server configuration and never exposed to the client.
- The route handler reads this value and stamps the new incident record with `organization_id = DEFAULT_CITIZEN_ORG_ID`.
- The citizen sees only their reference number. No organization name, ID, or type is returned in the response.

**Org B isolation guarantee:**
- Org B incidents originate exclusively from the mock 112 webhook (`/api/webhooks/112`), which is authenticated via shared secret.
- The webhook handler stamps those incidents with Org B's `organization_id`, derived from the webhook configuration, not the request body.
- No citizen portal request can be routed to Org B in the MVP.

**Security properties:**
- A citizen cannot choose or influence which organization receives their request.
- Incident data from Org A cannot be queried by Org B agents, and vice versa — enforced by org scoping middleware on all authenticated routes.
- No organization identity information is leaked through the citizen portal response.

**Environment variable added:**

| Variable | Purpose |
|---|---|
| `DEFAULT_CITIZEN_ORG_ID` | UUID of Org A; stamped on all citizen portal incidents |
| `WEBHOOK_ORG_B_ID` | UUID of Org B; stamped on all mock 112 webhook incidents |

### 7.2 JWT Claims Structure and Custom Claims Mechanism

Supabase Auth JWTs include standard claims by default. Custom application claims (`role`, `organization_id`, `hospital_id`) are **not** injected automatically — they require a **Supabase Auth custom access token hook**, which is the supported mechanism in Supabase Auth v2 for adding custom claims to the JWT at sign-in time.

**Mechanism (supported):**
- A `custom_access_token` Auth Hook is created in the Supabase project. This is a PostgreSQL function that Supabase Auth calls when issuing a token.
- The hook reads the user's record from the `users` table (keyed on `auth.uid()`) and appends `role`, `organization_id`, and `hospital_id` as custom claims in the `app_metadata` namespace of the JWT.
- The resulting JWT payload includes:

```json
{
  "sub": "user-uuid",
  "app_metadata": {
    "role": "response_agent",
    "organization_id": "org-uuid",
    "hospital_id": "hospital-uuid-or-null"
  }
}
```

- `role` determines which routes and actions are accessible. Valid role values: `response_agent`, `hospital_admin`, `ambulance_dispatcher`, `org_admin`.
- `organization_id` is extracted by the Org Scoping Middleware and injected into all database queries for that request.
- `hospital_id` is set only for `hospital_admin` users; scopes hospital registry writes to their facility.

> **MVP dispatch note:** For the competition prototype, dispatch functions (`POST dispatch/assign`, `PATCH dispatch status`) are accessible to both `response_agent` and `ambulance_dispatcher` role claims, as documented in §7.3. A pre-seeded `ambulance_dispatcher` account per organization will be available in the synthetic dataset. A dedicated dispatcher login with a separate `ambulance_dispatcher` JWT role is included in the MVP seed data. A fully distinct Ambulance Dispatcher onboarding workflow and UI panel is a potential Phase 2 enhancement.

> **Implementation note:** The `custom_access_token` hook is defined as a SQL function in a Supabase migration. The Technical Lead must configure this hook in the Supabase Auth settings and verify the claim namespace (`app_metadata` vs `user_metadata`) matches what the API middleware reads. This is a required setup step before authentication will carry org and role context.

### 7.3 Authorization — Role-Based Access (Server-Side)

Enforcement is in API middleware — never derived from UI state alone.

| Role | Permitted Routes |
|---|---|
| `response_agent` | GET/PATCH incidents (org-scoped), POST copilot/query, GET hospitals, GET dispatch/units, POST dispatch/assign, PATCH dispatch status, POST handover, GET audit |
| `hospital_admin` | GET/PUT hospitals/:id (their hospital only), POST acceptance, PATCH handover/acknowledge |
| `ambulance_dispatcher` | GET dispatch/units (org-scoped), POST dispatch/assign, PATCH dispatch status |
| `org_admin` | GET incidents (read), GET organizations/:id, GET organizations/:id/users |
| `citizen` | POST /api/incidents only |

### 7.4 Organization Scoping

The Org Scoping Middleware runs after Auth Middleware on every authenticated route:

1. Extracts `organization_id` from the verified JWT.
2. Injects `organization_id` as a required filter into all Supabase database queries for that request.
3. Any attempt to access an entity belonging to a different organization returns `403 Forbidden`.

`org_admin` users see only their own organization's data. There is no cross-organization view in the MVP.

---

## 8. Incident Lifecycle and State Machine

```
         [new]
           │ Agent acknowledges
           ▼
      [in_progress]
           │ Agent selects eligible hospital (copilot validates)
           ▼
   [hospital_selected]
           │ Hospital admin confirms patient acceptance
           ▼
   [acceptance_confirmed]
           │ Agent approves ambulance dispatch
           │ (server-side: acceptance operationally_valid + hospital still eligible)
           ▼
       [dispatched]
           │ Agent marks ambulance en route
           ▼
       [en_route]
           │ Agent marks ambulance arrived
           ▼
       [arrived]
           │ Agent closes incident
           ▼
       [closed]

Parallel path — escalation:
  Any non-closed state → [escalated] if no eligible hospital found,
  agent unresponsive, or agent initiates escalation manually.
  [escalated] → returns to [in_progress] when agent resumes coordination.

Safety alert path (see §9 for full detail):
  [acceptance_confirmed] → [alert_issued]
    triggered by: hospital status change BEFORE dispatch
    effect: acceptance operationally_valid set to false; dispatch blocked
    recovery: agent acknowledges → reselects hospital → fresh acceptance
              → re-approval of dispatch → [hospital_selected] →
              [acceptance_confirmed] → [dispatched]

  [dispatched] / [en_route] → [alert_issued]
    triggered by: hospital status change AFTER ambulance assigned
    effect: acceptance operationally_valid set to false;
            HIGH-PRIORITY ALERT to agent
    constraint: ambulance is NEVER autonomously cancelled or redirected
    recovery: agent acknowledges → human reassessment → [hospital_selected]
              (new hospital + fresh acceptance required before new dispatch)
              OR → [escalated] if no suitable hospital found
```

### State Transition Rules

| From | To | Triggered By | Server-Side Condition |
|---|---|---|---|
| `new` | `in_progress` | Agent acknowledges incident | Authenticated agent in same org |
| `in_progress` | `hospital_selected` | Agent selects hospital | Hospital passes full eligibility validation (§5) |
| `hospital_selected` | `acceptance_confirmed` | Hospital admin submits acceptance | `accepted_by_user_id` is a `hospital_admin` for that hospital; hospital still eligible at acceptance time |
| `acceptance_confirmed` | `dispatched` | Agent approves dispatch | Active `operationally_valid = true` acceptance record exists for this incident + hospital; hospital passes current eligibility check at dispatch time |
| `dispatched` | `en_route` | Agent manual update | Authenticated agent in same org |
| `en_route` | `arrived` | Agent manual update | Authenticated agent in same org |
| `arrived` | `closed` | Agent closes incident | Authenticated agent in same org |
| Any non-closed | `escalated` | Agent or system | Agent action or system escalation trigger |
| `acceptance_confirmed` | `alert_issued` | System (§9) | Hospital status changed to ineligible BEFORE dispatch |
| `dispatched` / `en_route` | `alert_issued` | System (§9) | Hospital status changed to ineligible AFTER ambulance assigned |
| `alert_issued` | `hospital_selected` | Agent (§9 recovery) | Agent acknowledges alert AND selects new eligible hospital |
| `alert_issued` | `escalated` | Agent | No suitable hospital available after alert |

---

## 9. Post-Acceptance Hospital Status Safety Control

This mechanism implements the approved D3 behavior (PRD F6.4).

### 9.1 Trigger Conditions

The safety control is triggered by two events:

1. **Active update:** A hospital administrator saves a status change to `unavailable`, `pending_confirmation`, or `closed` via `PUT /api/hospitals/:id/availability`. The route handler immediately checks for affected incidents.
2. **Staleness expiry:** The background freshness job (runs every 15 minutes) detects hospitals whose `last_verified_at` has crossed the `OUTDATED_THRESHOLD_HOURS` threshold and transitions them to `outdated`. This triggers the same affected-incident check.

In both cases: the system queries for all incidents in states `acceptance_confirmed`, `dispatched`, or `en_route` that reference the affected hospital.

### 9.2 Response by Incident State

> **Immutability rule:** The original patient acceptance record is never deleted. When a hospital becomes ineligible after acceptance, the system sets `operationally_valid = false`, `invalidated_at = NOW()`, and `invalidated_reason` on the existing record. The record remains in the database as permanent historical evidence of the original acceptance event. A new acceptance record must be created for any subsequent re-acceptance — it does not overwrite the invalidated one.

> **Ambulance constraint:** No autonomous cancellation or redirection of an active ambulance unit is permitted under any circumstances. The system raises a human alert and blocks further automated progression — the human agent and their supervisor make all decisions about active ambulances.

| Incident State | System Response |
|---|---|
| `acceptance_confirmed` | (a) Set `operationally_valid = false` on the acceptance record (preserve all original fields). (b) Block dispatch: `POST /api/dispatch/assign` returns `DISPATCH_BLOCKED_STATUS_CHANGE` for this incident. (c) Transition incident to `alert_issued`. (d) Display high-priority agent alert: "Hospital [name] is no longer eligible. Availability changed to [status]. The acceptance for this hospital is no longer operationally valid. You must select a new eligible hospital and obtain a new acceptance before dispatch can proceed." |
| `dispatched` | (a) Set `operationally_valid = false` on the acceptance record (preserve all original fields). (b) Transition incident to `alert_issued`. (c) Display high-priority agent alert: "Hospital [name] availability changed to [status] after ambulance [unit ID] was dispatched. Human reassessment is required. The ambulance must NOT be redirected or recalled without supervisor approval." (d) System does NOT cancel or redirect the ambulance. All ambulance decisions are made by the human agent and supervisor. |
| `en_route` | Same response as `dispatched`. The alert is additionally flagged for supervisor-level review in the audit log (`detail.supervisor_review_required: true`). |

### 9.3 Re-Verification and Dispatch Resumption Flow

After `alert_issued`, all recovery steps are human-driven. No step is automated.

```
[alert_issued]
       │
       ├─► REQUIRED: Agent acknowledges alert
       │     → audit: alert_acknowledged
       │
       ├─► Agent queries AI copilot for new eligible hospital
       │     Full pre-filter + post-filter eligibility validation runs (§5)
       │     If no eligible hospital: agent → [escalated]
       │
       ├─► Agent selects new eligible hospital
       │     Server-side: hospital passes all 5 eligibility checks at selection time
       │     → audit: hospital_reselected
       │     Incident status: [alert_issued] → [hospital_selected]
       │
       ├─► Hospital administrator submits FRESH patient acceptance
       │     for the NEW hospital (a new acceptance record is created —
       │     the invalidated record is not reused or overwritten)
       │     Server-side: new acceptance record created with operationally_valid = true
       │     → audit: patient_acceptance_submitted
       │     Incident status: [hospital_selected] → [acceptance_confirmed]
       │
       ├─► Agent reviews new acceptance and approves dispatch
       │     Server-side: verifies new operationally_valid acceptance record
       │     AND re-checks hospital eligibility at dispatch time
       │     → audit: dispatch_assigned
       │     Incident status: [acceptance_confirmed] → [dispatched]
       │
       └─► (If prior ambulance was dispatched) Agent records hospital change
             This is a human notification action — system does not redirect ambulance
             → audit: dispatch_hospital_changed
             Supervisor review required if ambulance is already en route
```

### 9.4 Audit Requirements

Every event in this flow generates an audit entry:

| Event | `action_type` | `source` |
|---|---|---|
| Hospital status changed | `hospital_status_changed` | human / system |
| Patient acceptance voided | `patient_acceptance_voided` | system |
| Dispatch blocked | `dispatch_blocked_status_change` | system |
| Alert issued to agent | `post_acceptance_alert_issued` | system |
| Agent acknowledges alert | `alert_acknowledged` | human |
| Agent re-verifies hospital | `agent_reverification_submitted` | human |
| New hospital selected | `hospital_reselected` | human |
| Fresh acceptance submitted | `patient_acceptance_submitted` | human |
| Agent override with reason | `agent_override_with_reason` | human |

### 9.5 Dispatch Assignment and Ambulance State Preservation

When an incident transitions to `alert_issued` — regardless of whether it was in `acceptance_confirmed`, `dispatched`, or `en_route` — the following ambulance data is **always preserved and never automatically altered**:

| Data Element | Preserved? | Notes |
|---|---|---|
| `dispatch_assignments` record | ✅ Always | Original assignment record is never deleted or modified by the system |
| Ambulance unit status (`dispatched`) | ✅ Always | Unit status is not changed by the safety alert; only a human agent can update it |
| Dispatch audit log entries | ✅ Always | All dispatch history remains in the immutable audit log |
| Ambulance unit ID and assignment timestamp | ✅ Always | These are permanent historical facts on the incident record |

The safety control does not cancel, redirect, or alter the ambulance assignment. It issues a human alert and blocks further automated incident state progression. All ambulance decisions after an alert are made exclusively by the response agent and their supervisor.

### 9.6 Implementation Approach

- **On-write trigger:** implemented in `PUT /api/hospitals/:id/availability` route handler. After saving the status update, queries for affected incidents and writes alert records within the same database transaction.
- **Staleness background job:** runs as a Next.js API route invoked on a 15-minute schedule (via a cron-style approach appropriate to Code Engine). Identifies `outdated` transitions and invokes the same affected-incident logic.
- **Dispatch block enforcement:** `POST /api/dispatch/assign` checks for an active, `operationally_valid = true` acceptance record AND verifies the hospital's current eligibility at dispatch time (not only at acceptance time) before allowing status transition to `dispatched`.

---

## 10. Audit Log Architecture

### 10.1 Principles

- The `audit_log_entries` table is append-only. The Supabase `authenticated` role has `INSERT` privilege only on `audit_log_entries` — no `UPDATE` or `DELETE` is granted. The immutability trigger (§10.1a) provides a fourth database-enforced layer.
- Audit entries are written atomically with the triggering action via a PostgreSQL RPC function (`write_with_audit`) — see §10.1a Layer 3. If any write within the RPC fails, the entire transaction rolls back.
- Every entry distinguishes `source`: `human` (agent or admin action), `ai_suggestion` (copilot output before human action), or `system` (automated state transitions, alerts, background jobs).
- The application-layer audit write path is a single internal function (`writeAuditEntry`). All route handlers and service modules call this function; there is no direct table access outside it in user-context code.
- System-context writes (background jobs, safety alert triggers) that use the `service_role` key must call the same `write_with_audit` RPC, supplying `organization_id` explicitly from their operational context.

### 10.1a Audit Write Security Controls — Layered Design

The append-only guarantee for `audit_log_entries` is enforced by four independent layers. Bypassing one does not bypass the others.

**Supabase API key model (authoritative):**

Supabase provides two API keys per project. There is no custom third key type:

| Key | Supabase Role | RLS Enforced | Correct Use |
|---|---|---|---|
| `anon` key | `anon` / `authenticated` (when JWT present) | ✅ Yes | All user-facing API routes (agent, hospital admin, org admin, citizen) |
| `service_role` key | Superuser-equivalent | ❌ Bypassed | Server-side only: background jobs, safety alert triggers, system writes with no user session |

The `service_role` key is a legitimate server-side secret stored as a Code Engine application secret (not a `NEXT_PUBLIC_` variable). It is required for system-context operations. It must never be embedded in client bundles, returned in API responses, or logged. All code paths using it must apply explicit `organization_id` scoping and authorization checks independently of RLS.

**Layer 1 — Database privilege grants (applied via SQL migration)**

Supabase's `authenticated` role is assumed by any request carrying a valid Supabase JWT (anon key + user token). Privilege grants on this role restrict what any authenticated user can do regardless of application logic:

```sql
-- audit_log_entries: authenticated users may SELECT and INSERT only
-- UPDATE and DELETE are explicitly revoked; they are also blocked by
-- the immutability trigger (Layer 4) for all roles including service role
GRANT SELECT, INSERT ON audit_log_entries TO authenticated;
REVOKE UPDATE, DELETE ON audit_log_entries FROM authenticated;

-- audit_log_entries: direct INSERT by authenticated users is ALSO removed.
-- All inserts go through write_with_audit() RPC only (see Layer 1c).
-- The GRANT INSERT above is therefore replaced by RPC-only access:
REVOKE INSERT ON audit_log_entries FROM authenticated;

-- patient_acceptance_records: INSERT for hospital_admin (controlled by RLS)
GRANT INSERT ON patient_acceptance_records TO authenticated;
-- No UPDATE granted to authenticated role on patient_acceptance_records.
-- Validity changes go through invalidate_acceptance_record() only (Layer 1b).
```

> **Audit insert access model:** `authenticated` users do **not** have direct `INSERT` on `audit_log_entries`. All audit writes — whether from user-context routes or system-context background jobs — go through the `write_with_audit()` PostgreSQL function (Layer 3). This function is a `SECURITY DEFINER` function that enforces actor identity, organization, and action constraints before writing. This eliminates the forgery risk of an authenticated user calling a direct `INSERT` with an arbitrary `actor_id` or `organization_id`.

**Layer 1b — Patient acceptance record validity change via SECURITY DEFINER function**

The `operationally_valid`, `invalidated_at`, and `invalidated_reason` columns are changed only by the §9 safety control, invoked server-side using the `service_role` client. No authenticated user role has `UPDATE` on `patient_acceptance_records`.

```sql
CREATE OR REPLACE FUNCTION invalidate_acceptance_record(
  p_incident_id UUID,
  p_reason TEXT
)
RETURNS void
SECURITY DEFINER
SET search_path = public, pg_catalog
LANGUAGE plpgsql AS $$
DECLARE
  v_hospital_id UUID;
  v_current_status TEXT;
BEGIN
  -- Authorization check: verify the incident exists and the referenced
  -- hospital's current availability_status is actually ineligible before
  -- allowing the invalidation. This prevents arbitrary invalidation calls.
  SELECT hcp.availability_status
    INTO v_current_status
    FROM incidents i
    JOIN hospital_capability_profiles hcp ON hcp.hospital_id = i.selected_hospital_id
   WHERE i.id = p_incident_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalidate_acceptance_record: incident % not found', p_incident_id;
  END IF;

  IF v_current_status = 'confirmed' THEN
    RAISE EXCEPTION
      'invalidate_acceptance_record: hospital for incident % still has confirmed status; invalidation rejected',
      p_incident_id;
  END IF;

  -- Perform the targeted update; preserve all original acceptance fields
  UPDATE patient_acceptance_records
     SET operationally_valid = false,
         invalidated_at      = NOW(),
         invalidated_reason  = p_reason
   WHERE incident_id        = p_incident_id
     AND operationally_valid = true;
END;
$$;

-- Restrict execution: revoke from PUBLIC, grant to service_role only
-- The Supabase service_role API key connects as the 'service_role' PostgreSQL role,
-- NOT as 'postgres'. Granting to 'postgres' would not enable execution from
-- server-side code using the service_role client.
REVOKE EXECUTE ON FUNCTION invalidate_acceptance_record(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION invalidate_acceptance_record(UUID, TEXT) TO service_role;
```

> **Execution access — corrected:** In Supabase, the `service_role` API key connects to the database as the `service_role` PostgreSQL role — **not** as `postgres`. The `postgres` role is the database owner and is distinct from the `service_role` connection role. Granting `EXECUTE` to `service_role` ensures the function is callable from server-side Next.js code using the `service_role` Supabase client. It remains inaccessible to `authenticated` users (anon key path), which use a separate connection role with no `EXECUTE` grant on this function.

**Layer 1c — Audit INSERT access via SECURITY DEFINER write_with_audit() function**

To prevent audit record forgery, authenticated users do not have direct `INSERT` on `audit_log_entries`. All writes go through `write_with_audit()`, which is a `SECURITY DEFINER` function that enforces the following invariants before inserting:

- `actor_id` is set from `auth.uid()` — the verified Supabase Auth user UUID — not from caller-supplied data.
- `actor_role` is read from `auth.jwt() -> 'app_metadata' ->> 'role'` — the verified JWT claim — not from caller-supplied data.
- `organization_id` is read from `auth.jwt() -> 'app_metadata' ->> 'organization_id'` — the verified JWT claim — not from caller-supplied data.
- For system-context calls (service role, no user JWT), the function accepts `organization_id` as a required parameter and validates it against the `organizations` table before inserting.

> **Identity enforcement in SECURITY DEFINER context:** `SECURITY DEFINER` changes the privilege level of the executing function to its owner, but does **not** change the session's JWT context. In Supabase/PostgREST, `auth.uid()` and `auth.jwt()` read from the `request.jwt.claims` session variable, which is set by PostgREST from the caller's Authorization header before every request. This session variable is not affected by `SECURITY DEFINER`. Therefore, `auth.uid()` inside `write_with_audit()` always reflects the authenticated caller's identity — it cannot be spoofed by the caller because it comes from the verified JWT, not from function arguments.

```sql
CREATE OR REPLACE FUNCTION write_with_audit(
  p_operation_data JSONB,  -- describes the triggering write: type, entity_id, detail
  p_audit_source   TEXT,   -- 'human' | 'ai_suggestion' | 'system'
  p_action_type    TEXT,   -- must match a value in the action_type registry
  p_entity_type    TEXT,
  p_entity_id      UUID,
  p_incident_id    UUID    DEFAULT NULL,
  p_org_id         UUID    DEFAULT NULL  -- required only when called from system context;
                                         -- ignored and overridden by JWT when user session present
)
RETURNS UUID  -- returns the new audit_log_entries.id
SECURITY DEFINER
SET search_path = public, pg_catalog
LANGUAGE plpgsql AS $$
DECLARE
  v_actor_id   UUID;
  v_actor_role TEXT;
  v_org_id     UUID;
  v_entry_id   UUID;
BEGIN
  -- Resolve actor identity from the caller's JWT session context.
  -- auth.uid() and auth.jwt() read from request.jwt.claims (set by PostgREST
  -- from the caller's Authorization header). This is NOT affected by SECURITY DEFINER.
  -- An authenticated caller cannot forge these values.
  v_actor_id   := auth.uid();
  v_actor_role := auth.jwt() -> 'app_metadata' ->> 'role';
  v_org_id     := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_actor_id IS NOT NULL THEN
    -- USER-CONTEXT PATH: JWT present (anon key + user token).
    -- Enforce identity entirely from JWT. Ignore p_org_id even if supplied —
    -- a caller cannot use p_org_id to target a different organization.
    -- v_actor_id, v_actor_role, v_org_id are all already set from JWT above.
    -- p_audit_source must be 'human' or 'ai_suggestion' in this path.
    IF p_audit_source NOT IN ('human', 'ai_suggestion') THEN
      RAISE EXCEPTION
        'write_with_audit: user-context calls must use source "human" or "ai_suggestion", got "%"',
        p_audit_source;
    END IF;

  ELSE
    -- SYSTEM-CONTEXT PATH: No user JWT (service_role call from background job or safety trigger).
    -- p_org_id is required and must be validated.
    -- p_audit_source must be 'system' in this path.
    IF p_org_id IS NULL THEN
      RAISE EXCEPTION 'write_with_audit: system-context call must supply p_org_id';
    END IF;
    IF p_audit_source <> 'system' THEN
      RAISE EXCEPTION
        'write_with_audit: system-context calls must use source "system", got "%"',
        p_audit_source;
    END IF;
    -- Validate the supplied org_id exists in the organizations table
    PERFORM 1 FROM organizations WHERE id = p_org_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'write_with_audit: organization % not found', p_org_id;
    END IF;
    v_org_id     := p_org_id;
    v_actor_id   := NULL;   -- no user identity in system context
    v_actor_role := 'system';
  END IF;

  -- Validate action_type against the approved registry (prevents arbitrary string injection)
  IF p_action_type NOT IN (
    'incident_created','incident_status_changed','copilot_query','copilot_response',
    'hospital_validation_excluded','hospital_selected','agent_override',
    'patient_acceptance_submitted','patient_acceptance_voided',
    'dispatch_assigned','dispatch_status_changed','dispatch_blocked_status_change',
    'post_acceptance_alert_issued','alert_acknowledged','agent_reverification_submitted',
    'hospital_reselected','dispatch_hospital_changed','hospital_status_changed',
    'handover_generated','handover_acknowledged','escalation_triggered',
    'language_assistance_flagged','copilot_escalation_no_eligible_hospitals'
  ) THEN
    RAISE EXCEPTION 'write_with_audit: unknown action_type "%"', p_action_type;
  END IF;

  INSERT INTO audit_log_entries (
    id, incident_id, organization_id, actor_id, actor_role,
    action_type, source, entity_type, entity_id, detail, created_at
  )
  VALUES (
    gen_random_uuid(), p_incident_id, v_org_id, v_actor_id, v_actor_role,
    p_action_type, p_audit_source, p_entity_type, p_entity_id,
    p_operation_data, NOW()
  )
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

-- authenticated users may call write_with_audit() for user-context audit writes
-- service_role (not postgres) is the PostgreSQL connection role used by the service_role API key
REVOKE EXECUTE ON FUNCTION write_with_audit(JSONB, TEXT, TEXT, TEXT, UUID, UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION write_with_audit(JSONB, TEXT, TEXT, TEXT, UUID, UUID, UUID) TO authenticated;
GRANT  EXECUTE ON FUNCTION write_with_audit(JSONB, TEXT, TEXT, TEXT, UUID, UUID, UUID) TO service_role;
```

> **Forgery prevention summary:**
> - `actor_id`, `actor_role`, and `organization_id` are sourced from the JWT session context — not from caller-supplied arguments. Authenticated users cannot forge these values.
> - System-context calls (no JWT) must supply `p_org_id`, which is validated against the `organizations` table. They cannot claim a non-existent org.
> - System-context calls are locked to `p_audit_source = 'system'`; user-context calls are locked to `'human'` or `'ai_suggestion'`. Neither path can forge the other's source label.
> - `action_type` is validated against a fixed registry. Arbitrary strings cannot be injected.

**Layer 2 — Row-Level Security (RLS)**

RLS is enabled on `audit_log_entries` and all other application tables.

*`audit_log_entries` RLS policies:*

| Policy | Operation | Condition |
|---|---|---|
| *(removed)* | `INSERT` | No direct `INSERT` policy needed — `authenticated` users have no `INSERT` privilege on `audit_log_entries`. All inserts go through `write_with_audit()` (SECURITY DEFINER), which executes as its owner and is not subject to the caller's RLS policies. |
| `audit_select_own_org` | `SELECT` | `organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid` |
| *(none)* | `UPDATE` / `DELETE` | No policy defined — denied by Layer 1 privilege revoke; blocked by Layer 4 trigger for all roles including service_role |

> **RLS and SECURITY DEFINER interaction:** PostgreSQL SECURITY DEFINER functions execute as the function owner's role, bypassing the caller's RLS policies. This means `write_with_audit()` is not subject to RLS on `audit_log_entries` when it performs the INSERT. Identity and org enforcement is handled inside the function body (Layer 1c), making the now-removed `audit_insert_own_org` INSERT policy redundant. The `audit_select_own_org` SELECT policy remains necessary and effective because `SELECT` queries from user-context code do not go through a SECURITY DEFINER function.

Service role bypass on SELECT: `service_role` key bypasses RLS on SELECT as well. The background job and safety trigger code access `audit_log_entries` only for writes (via `write_with_audit()`), not for reads. Any `service_role`-keyed SELECT should apply explicit `WHERE organization_id = ?` filters in the calling code.

*`patient_acceptance_records` RLS policies:*

| Policy | Operation | Condition |
|---|---|---|
| `acceptance_insert_hospital_admin` | `INSERT` | JWT `app_metadata.role = 'hospital_admin'` AND `hospital_id` matches JWT `app_metadata.hospital_id` |
| `acceptance_select_own_org` | `SELECT` | Incident's `organization_id` matches JWT `app_metadata.organization_id` |
| *(none)* | `UPDATE` | No direct `UPDATE` policy for `authenticated` role — updates go through `invalidate_acceptance_record()` security-definer function only |

**Layer 3 — Atomic writes via PostgreSQL RPC**

The `supabase-js` client does not expose `BEGIN`/`COMMIT`/`ROLLBACK` directly. Atomic multi-table writes use PostgreSQL functions invoked via `supabase.rpc()`. Each function executes within a single server-side transaction. If any statement fails, the whole transaction rolls back.

`write_with_audit()` (defined in Layer 1c above) serves as both the atomic write mechanism and the identity-enforcement gateway. It accepts the triggering operation data and audit parameters, executes any required DML alongside the audit insert within one transaction, and returns the new audit entry ID. The Next.js API route calls `supabase.rpc('write_with_audit', { ... })` — one network call, atomically committed or rolled back with identity and org constraints enforced inside the database.

**Layer 4 — Immutability trigger**

```sql
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS trigger
SECURITY DEFINER
SET search_path = public, pg_catalog
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'audit_log_entries is append-only: % is not permitted (row id: %)',
    TG_OP, OLD.id;
  RETURN NULL;  -- never reached; silences compiler warning
END;
$$;

CREATE TRIGGER audit_log_immutability
  BEFORE UPDATE OR DELETE ON audit_log_entries
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
```

This trigger fires before any `UPDATE` or `DELETE` on `audit_log_entries` regardless of which PostgreSQL role issues the statement — including the `service_role` connection role and the `postgres` superuser. It is the strongest enforcement layer: it cannot be bypassed by role grants, RLS policy gaps, or application logic. The `SECURITY DEFINER` attribute and locked `search_path` prevent the trigger function itself from being subverted via search path injection.

### 10.1b Negative Security Tests (Required)

All tests reference the verified Supabase two-key model, PostgreSQL privilege grants, RLS policies, SECURITY DEFINER functions, and the immutability trigger. All references to non-existent mechanisms (`SUPABASE_APP_ROLE_KEY`, `rrai_app` named role) are absent.

| Test | Layer Tested | Expected Behavior |
|---|---|---|
| Authenticated user attempts direct `INSERT` into `audit_log_entries` | Layer 1 privilege revoke | PostgreSQL rejects: `ERROR: permission denied for table audit_log_entries` |
| Authenticated user calls `write_with_audit()` supplying a different user's UUID as `actor_id` | Layer 1c identity enforcement | Function ignores the argument; sets `actor_id = auth.uid()` from verified JWT session — not from caller-supplied data |
| Authenticated user calls `write_with_audit()` supplying a different org's UUID as `p_org_id` | Layer 1c identity enforcement | User-context path ignores `p_org_id` entirely; `organization_id` is set exclusively from verified JWT claim |
| Authenticated user calls `write_with_audit()` with `p_audit_source = 'system'` | Layer 1c source enforcement | Function raises: `EXCEPTION: user-context calls must use source "human" or "ai_suggestion"` |
| System-context (service_role) call supplies `p_audit_source = 'human'` | Layer 1c source enforcement | Function raises: `EXCEPTION: system-context calls must use source "system"` |
| Authenticated user calls `write_with_audit()` with an unrecognised `action_type` value | Layer 1c action-type validation | Function raises: `EXCEPTION: write_with_audit: unknown action_type "<value>"` |
| Authenticated user attempts `UPDATE` on any `audit_log_entries` row | Layer 1 privilege revoke + Layer 4 trigger | PostgreSQL rejects on privilege check; if reached, trigger fires: `EXCEPTION: audit_log_entries is append-only: UPDATE is not permitted` |
| Authenticated user attempts `DELETE` on any `audit_log_entries` row | Layer 1 privilege revoke + Layer 4 trigger | PostgreSQL rejects on privilege check; if reached, trigger fires |
| `service_role` server-side code (bug path) attempts `UPDATE` on `audit_log_entries` | Layer 4 trigger — fires for all roles including `service_role` | Trigger fires regardless of role: `EXCEPTION: audit_log_entries is append-only: UPDATE is not permitted (row id: <id>)` |
| Audit RPC write fails mid-transaction (constraint violation or exception) | Layer 3 PostgreSQL RPC atomicity | Entire transaction rolls back; triggering action not committed; caller receives error |
| Authenticated user attempts to read audit rows belonging to a different organization | Layer 2 RLS `audit_select_own_org` | RLS returns empty result set — no rows from other orgs visible |
| Authenticated user directly calls `UPDATE` on `operationally_valid` in `patient_acceptance_records` | Layer 1 — no `UPDATE` grant to `authenticated` | PostgreSQL rejects: `ERROR: permission denied for table patient_acceptance_records` |
| Authenticated user attempts to call `invalidate_acceptance_record()` directly | Layer 1b — `EXECUTE` not granted to `authenticated` | PostgreSQL rejects: `ERROR: permission denied for function invalidate_acceptance_record` |
| `service_role` code calls `invalidate_acceptance_record()` for an incident whose hospital still has `confirmed` status | Layer 1b authorization check inside function | Function raises: `EXCEPTION: hospital for incident X still has confirmed status; invalidation rejected` |
| `service_role` code calls `invalidate_acceptance_record()` for a non-existent incident | Layer 1b authorization check inside function | Function raises: `EXCEPTION: incident X not found` |
| Non-hospital-admin role attempts `INSERT` into `patient_acceptance_records` | Layer 2 RLS `acceptance_insert_hospital_admin` | RLS rejects: role claim does not match `hospital_admin` |
| Hospital admin inserts acceptance record for a hospital not matching their JWT `hospital_id` | Layer 2 RLS `acceptance_insert_hospital_admin` | RLS rejects: `hospital_id` mismatch |
| `SUPABASE_SERVICE_ROLE_KEY` used in a `NEXT_PUBLIC_` environment variable | Deployment configuration check | Build/deployment check flags this; key must never appear in client-accessible namespace |
| `SUPABASE_SERVICE_ROLE_KEY` returned in an API response body or logged to console | Code review gate | Flagged as a critical security finding; no merge without correction |
| Unauthenticated caller invokes a privileged server API route (e.g. `POST /api/dispatch/assign`) | Auth middleware | Returns `401 Unauthorized`; no database operation executed |
| Authenticated user of one org reads or writes incidents belonging to another org | Layer 2 RLS + org scoping middleware | Returns empty result or `403 Forbidden`; no cross-org data exposed |

### 10.2 Action Type Registry

| `action_type` | `source` | Description |
|---|---|---|
| `incident_created` | human / system | New incident created (citizen or webhook) |
| `incident_status_changed` | human | Agent updates incident status |
| `copilot_query` | human | Agent submits copilot query |
| `copilot_response` | ai_suggestion | Copilot returns recommendations |
| `hospital_validation_excluded` | system | Hospital excluded by validation service |
| `hospital_selected` | human | Agent selects hospital |
| `agent_override` | human | Agent overrides AI suggestion (includes reason) |
| `patient_acceptance_submitted` | human | Hospital admin submits acceptance |
| `patient_acceptance_voided` | system | Acceptance voided by post-acceptance status change |
| `dispatch_assigned` | human | Agent/dispatcher assigns ambulance unit |
| `dispatch_status_changed` | human | Dispatch status updated |
| `dispatch_blocked_status_change` | system | Dispatch blocked by F6.4 safety control |
| `post_acceptance_alert_issued` | system | Alert raised for active dispatch after status change |
| `alert_acknowledged` | human | Agent acknowledges post-acceptance alert |
| `agent_reverification_submitted` | human | Agent re-verifies hospital after alert |
| `hospital_reselected` | human | Agent selects new hospital after alert |
| `dispatch_hospital_changed` | human | Agent records hospital change notification for active ambulance |
| `hospital_status_changed` | human / system | Hospital admin updates availability status, or system marks outdated |
| `handover_generated` | human | Agent generates handover summary |
| `handover_acknowledged` | human | Hospital admin acknowledges handover |
| `escalation_triggered` | human / system | Incident escalated |
| `language_assistance_flagged` | human | Agent sets language assistance flag |
| `copilot_escalation_no_eligible_hospitals` | system | Pre-filter found zero eligible hospitals; AI model not called |

---

## 11. Deployment Architecture

### 11.1 Preferred — IBM Cloud (Code Engine)

IBM Cloud Code Engine is the preferred deployment target. This directly aligns with the IBM AI Builders Challenge competition narrative.

```
┌──────────────────────────────────────────────┐
│              IBM Cloud                        │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │  Code Engine Application                │ │
│  │  Next.js 14 (SSR + API Routes)          │ │
│  │  Container: node:20-alpine              │ │
│  └──────────────────┬──────────────────────┘ │
│                     │                         │
│  ┌──────────────────▼──────────────────────┐ │
│  │  IBM watsonx.ai (Granite 3.x)           │ │
│  │  Text Generation API                    │ │
│  └─────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
         │ External managed service
         ▼
┌──────────────────────────────────────────────┐
│  Supabase (managed PostgreSQL + Auth)         │
│  Region: us-east or eu-west                   │
└──────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────┐
│  GitHub (source control)                      │
└──────────────────────────────────────────────┘
```

**Code Engine configuration:**
- Single application (monorepo: Next.js handles both frontend and API)
- Container built from `Dockerfile` in repo root
- Environment variables via Code Engine secrets (watsonx.ai API key, Supabase URL and anon key, webhook secret)
- Min instances: 1, Max instances: 3 (for demo reliability)

### 11.2 Contingency Deployment

> ⚠️ **Verification Required (Outstanding Action OA-1):** The suitability of contingency hosting for the IBM AI Builders Challenge has not been verified. Do not use contingency deployment without confirming it is permissible under the official competition rules.

| Layer | Contingency Target |
|---|---|
| Frontend + API | Vercel (Next.js native) |
| Database | Supabase (unchanged) |
| AI services | IBM watsonx.ai (unchanged — IBM services are retained regardless of hosting) |

### 11.3 Environment Configuration

| Variable | Purpose |
|---|---|
| `WATSONX_API_KEY` | IBM Cloud IAM API key for watsonx.ai |
| `WATSONX_PROJECT_ID` | watsonx.ai project ID |
| `WATSONX_URL` | watsonx.ai regional endpoint |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key (public); used for user-context API calls (anon key + user JWT). Safe for client bundles. |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side secret only). Used exclusively for system-context writes (background jobs, safety alert triggers) where no user JWT is present. Must never appear in a `NEXT_PUBLIC_` variable or be returned in any API response. Store as a Code Engine secret with server-only access. |
| `WEBHOOK_112_SECRET` | Shared secret for mock 112 webhook |
| `WEBHOOK_ORG_B_ID` | UUID of Org B; stamped on mock 112 webhook incidents |
| `DEFAULT_CITIZEN_ORG_ID` | UUID of Org A; stamped on all citizen portal incident submissions |
| `OUTDATED_THRESHOLD_HOURS` | Hospital availability expiry window (default: 4) |

---

## 12. Security Controls

| Control | Implementation |
|---|---|
| **Authentication** | Supabase Auth JWT; all non-public routes reject unauthenticated requests |
| **Authorization** | Server-side RBAC in API middleware; org scoping on every database query |
| **Data isolation** | Organization ID FK on all incident/dispatch/audit data; hospital admin scoped to their facility by JWT claim |
| **Audit immutability** | Authenticated users have no direct INSERT on `audit_log_entries`. All writes go through `write_with_audit()` SECURITY DEFINER function enforcing JWT-verified identity. UPDATE/DELETE blocked by privilege revoke and immutability trigger (fires for all roles including service_role). |
| **Input validation** | All API inputs validated server-side against defined schemas before processing |
| **Secrets management** | All API keys and secrets in Code Engine environment secrets — never in source code or client bundles. `SUPABASE_SERVICE_ROLE_KEY` is a server-side only secret for system-context writes; it must never appear in `NEXT_PUBLIC_` variables or client-accessible responses. User-context calls use the `anon` key + user JWT. |
| **HTTPS** | All traffic encrypted in transit; enforced by Code Engine / Vercel |
| **Webhook authentication** | Mock 112 webhook validated by shared secret header |
| **Synthetic data labeling** | All fictional data is seeded with a `is_synthetic: true` flag and labeled in the UI |
| **No live PII in prototype** | Citizen intake collects only synthetic test data; no real personal data is permitted in the prototype database |

---

## 13. MVP vs. Future Roadmap Boundaries

| Capability | MVP Implementation | Future Roadmap |
|---|---|---|
| Hospital registry | Seeded synthetic data (~12 fictional hospitals); admin update UI | Real-time hospital self-reporting; verified data feeds |
| AI copilot | RAG via watsonx.ai; server-side validation | Fine-tuned emergency domain model; predictive capacity |
| Citizen intake | Web form (Next.js page) | Voice/IVR intake; mobile app; SMS |
| Notifications | Dashboard polling/realtime (Supabase) | SMS, push, email notifications |
| Organization setup | Two seeded synthetic orgs; read-only admin panel | Self-service registration, verification, approval workflow |
| Authentication | Supabase Auth; seeded user accounts | SSO, MFA, government ID verification |
| 112 integration | Mock webhook endpoint (conditional F11) | Authorized live integration with Nigerian 112 infrastructure |
| Language support | English + limited Pidgin; i18n structure | Hausa, Yoruba, Igbo, Fulfulde, Kanuri; validated translation |
| Map/routing | None | Live ambulance routing with map visualization |
| Analytics | Audit log viewer | Operational dashboards, incident analytics, capacity forecasting |

---

## 14. Outstanding Actions

| ID | Action | Owner | Blocking |
|---|---|---|---|
| OA-1 | Verify official IBM AI Builders Challenge deployment requirements — confirm whether IBM Cloud Code Engine is required or whether contingency hosting is permissible | Product Lead | Must resolve before Week 4 |
| OA-2 | Confirm IBM watsonx.ai model ID and endpoint available on team's IBM Cloud account | Technical Lead | Must resolve before Week 2 AI integration |
| OA-3 | Set up GitHub repository and share with both team members; initialize Next.js project scaffold | Technical Lead | Week 1 |
| OA-4 | Set up Supabase project and confirm free tier capacity | Technical Lead | Week 1 |
| OA-5 | Confirm IBM Cloud Code Engine account access and quota | Technical Lead | Week 1 |
| OA-6 | Review synthetic hospital dataset for realism sufficiency (~12 fictional Nigerian hospitals) | Product Lead | Before synthetic data seeding in Week 1 |
| OA-7 | Implement and verify `custom_access_token` Auth Hook in Supabase project; confirm `app_metadata` claim namespace is readable by API middleware and matches RLS policy expressions | Technical Lead | Must resolve in Week 1 before any authenticated routes are built |
| OA-8 | Create Supabase SQL migrations for: (a) `REVOKE INSERT` on `audit_log_entries` from `authenticated`; `GRANT SELECT` only, (b) `write_with_audit()` SECURITY DEFINER function with identity enforcement and action_type validation, (c) `invalidate_acceptance_record()` SECURITY DEFINER function with authorization check, (d) `audit_log_immutability` BEFORE UPDATE OR DELETE trigger with SECURITY DEFINER and locked search_path, (e) `GRANT`/`REVOKE EXECUTE` statements for both functions | Technical Lead | Must complete before any audit-dependent or acceptance-dependent features in Week 2 |
| OA-9 | Verify that `SUPABASE_SERVICE_ROLE_KEY` is configured as a Code Engine server-side secret only (no `NEXT_PUBLIC_` prefix); confirm it is not returned in any API response or written to application logs | Technical Lead | Week 1 deployment setup |
| OA-10 | Verify that `invalidate_acceptance_record()` is callable via `service_role` client (PostgreSQL `service_role` role) and is not executable by `authenticated` users. Confirm that `GRANT EXECUTE TO service_role` is correct for the Supabase project's PostgreSQL role configuration. | Technical Lead | Week 2, before patient acceptance feature is implemented |
| OA-11 | Confirm that `write_with_audit()` correctly reads `auth.uid()` and `auth.jwt()` in a SECURITY DEFINER context in Supabase; verify that JWT claims are accessible inside the function when called via `supabase.rpc()` | Technical Lead | Week 2, before audit integration is complete |

---

## 15. Change Log

| Version | Date | Author | Summary of Changes |
|---|---|---|---|
| 1.0 | November 2026 | IBM Bob, per Product Lead | Initial draft |
| 1.1 | November 2026 | IBM Bob (quality review per Product Lead instruction) | (1) Added §7.5 citizen request organization routing with environment variable design. (2) Removed override path for ineligible hospital patient acceptance — no override permitted. (3) Unified validation sequence into single 5-check composite model applied as both pre-filter and post-filter in §5 and §6. (4) Strengthened §6 integration flow with explicit dual-pass validation pipeline. (5) Completed §9 post-acceptance safety state machine with re-verification flow, dispatch resumption path, and per-state acceptance voiding. (6) Strengthened §10 audit architecture with enforceable DB role permissions, RLS policy, atomic write requirement, single write path, and negative security test cases. Added two new environment variables. Updated action type registry. |
| 1.2 | November 2026 | IBM Bob (per Product Lead correction instruction) | (1) §8 state machine reconciled with §9 recovery path: `alert_issued` → `hospital_selected` transition added to state diagram and transition table; escalation path from `alert_issued` added; all transition conditions made explicit. (2) §9.2 clarified: `voided` column replaced by `operationally_valid` flag in `patient_acceptance_records`; original acceptance data always preserved; records never deleted; immutability principle and ambulance constraint documented as callout blocks. §9.3 recovery flow updated to reflect new acceptance record creation (not reuse of invalidated record). §3.2 `patient_acceptance_records` schema updated to match. (3) §10.1a restructured as three independent enforcement layers: PostgreSQL role privileges, Supabase RLS, and application single write path; service role key runtime exclusion documented; transaction boundary semantics clarified; RLS policy behavior and Supabase trigger limitation declared. Negative security test added for service role key in deployment. |
| 1.3 | November 2026 | IBM Bob (per Product Lead correction instruction) | (1) §10.1a and §11.3 reconciled: `SUPABASE_SERVICE_ROLE_KEY` removed from deployed environment; replaced with `SUPABASE_APP_ROLE_KEY` scoped to `rrai_app` role; service role key restricted to local dev and migrations only. Role privilege table expanded to show `rrai_app` permissions across all tables, including the column-scoped `UPDATE` on `patient_acceptance_records`. RLS policies for both `audit_log_entries` and `patient_acceptance_records` specified. (2) Duplicate §10.1b Negative Security Tests merged into one complete, non-duplicated section; two new tests added for `patient_acceptance_records` UPDATE restriction and `SUPABASE_APP_ROLE_KEY` privilege verification. (3) New §9.5 Dispatch Assignment and Ambulance State Preservation added: explicit table of preserved data elements; system constraint against autonomous cancellation/redirection restated at the implementation level. §9.5 renamed to §9.6 Implementation Approach; dispatch block enforcement updated to reference `operationally_valid` flag. (4) §12 Secrets Management control updated to reflect service role key exclusion from deployed environments. |
| 1.4 | November 2026 | IBM Bob (technical feasibility review per Product Lead instruction) | Five verified corrections applied: (1) §10.1a: `SUPABASE_APP_ROLE_KEY` removed — no such custom API key mechanism exists in Supabase. Replaced with correct two-key pattern: `anon` key for user-context calls (RLS enforced); `service_role` key for system-context server-side writes (no user JWT). `SUPABASE_SERVICE_ROLE_KEY` restored to §11.3 as a legitimate server-side secret; runtime exclusion from client bundles and `NEXT_PUBLIC_` variables documented. (2) §10.1a: Incorrect statement that Supabase does not support PostgreSQL triggers corrected. Supabase managed PostgreSQL does support `BEFORE`/`AFTER` triggers via SQL migrations. `audit_log_immutability` trigger added as recommended migration task (OA-8). (3) §10.1a Layer 3: `supabase-js` does not expose `BEGIN`/`COMMIT`/`ROLLBACK` — correct atomicity mechanism is PostgreSQL RPC (`supabase.rpc()`); `write_with_audit` RPC function pattern specified. (4) §7.2: JWT custom claims mechanism corrected — Supabase requires a `custom_access_token` Auth Hook (not automatic); hook implementation added as blocking OA-7; `app_metadata` claim namespace documented. (5) §9.5 incident state note preserved: `alert_issued` transition does not alter ambulance assignment, dispatch record, or operational history. Outstanding actions OA-7, OA-8, OA-9 added. Negative security tests in §10.1b updated to reflect corrected architecture. |
| 1.5 | November 2026 | IBM Bob (final security consistency check per Product Lead instruction) | Three targeted corrections to §10: (1) Audit record forgery prevention: `authenticated` role `INSERT` on `audit_log_entries` revoked; all audit writes now go exclusively through `write_with_audit()` SECURITY DEFINER function (Layer 1c). Function enforces `actor_id`, `actor_role`, and `organization_id` from verified JWT — not caller-supplied. Action_type validated against registry. System-context path requires explicit `p_org_id` validated against `organizations` table. (2) `invalidate_acceptance_record()` strengthened: `SET search_path` locked to `public, pg_catalog`; authorization check added inside function to verify hospital is actually ineligible before update; `REVOKE EXECUTE FROM PUBLIC` present; `GRANT EXECUTE TO postgres` added (incorrectly — corrected in v1.6). (3) `prevent_audit_log_modification()` trigger function hardened: `SECURITY DEFINER` attribute and `SET search_path` added to prevent search path injection; `TG_OP` and `OLD.id` included in exception message. §10.1b negative security tests fully revised: 20 tests covering forgery, identity enforcement, action_type validation, immutability trigger (service role path included), RLS org isolation, privilege revocation, patient acceptance controls, deployment secret controls, and cross-org access. OA-8 updated to include all five migration items. OA-10 and OA-11 added as implementation verification actions. |
| 1.6 | November 2026 | IBM Bob (targeted security consistency review per Product Lead instruction) | Five corrections applied: (1) **`invalidate_acceptance_record()` EXECUTE grant corrected:** `GRANT EXECUTE TO postgres` replaced with `GRANT EXECUTE TO service_role`. The Supabase `service_role` API key connects to PostgreSQL as the `service_role` role, not `postgres`. Granting to `postgres` would have left the function uncallable from server-side application code. The execution access note updated accordingly. (2) **`write_with_audit()` EXECUTE grant corrected:** `GRANT EXECUTE TO postgres` replaced with `GRANT EXECUTE TO service_role` for the same reason. (3) **`write_with_audit()` system-context isolation strengthened:** explicit `IF v_actor_id IS NOT NULL` / `ELSE` branching added; `p_org_id` is explicitly ignored in the user-context path (cannot be used to target a different org); `p_audit_source` is validated per path — user-context must be `'human'`/`'ai_suggestion'`; system-context must be `'system'`. Neither path can forge the other's source label. Identity enforcement note added explaining SECURITY DEFINER does not affect `auth.uid()` / `auth.jwt()` session context. (4) **`audit_insert_own_org` RLS INSERT policy removed:** `authenticated` users have no direct `INSERT` on `audit_log_entries`; the INSERT RLS policy was redundant (SECURITY DEFINER bypasses RLS anyway). RLS and SECURITY DEFINER interaction documented. (5) **§10.1b negative security tests updated:** two new tests added for `p_audit_source` cross-context enforcement; test for authenticated user calling `invalidate_acceptance_record()` updated to reflect correct `EXECUTE` denial (not `confirmed status` check); orphaned reference to `audit_insert_own_org` INSERT policy test removed; §12 Audit immutability control updated to match. OA-10 clarified to reference `service_role` PostgreSQL role. |
| 1.7 | November 2026 | IBM Bob (per Product Lead INC-1/INC-2/INC-3 resolution) | (INC-2) Header corrected to v1.7; aligned-to reference updated to PRD v1.3; footer updated to v1.7. (INC-3) §7.2 JWT claims note updated: `ambulance_dispatcher` added to the valid role values list; MVP dispatch note added clarifying that `response_agent` and `ambulance_dispatcher` both access dispatch routes; a pre-seeded `ambulance_dispatcher` account per organization is included in the MVP synthetic dataset; a dedicated dispatcher onboarding workflow and UI panel is a potential Phase 2 enhancement. No other sections modified. |

---

*Document prepared using IBM Bob.*
*Version 1.7 — Revised Draft. Awaiting team review and approval.*
*Aligned to PRD v1.3.*
*Internal Deadline: December 3, 2026.*
