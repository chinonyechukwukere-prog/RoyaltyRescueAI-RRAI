# MVP Scope Document
# Royalty Rescue AI (RRAI)
### Version 1.1 — Draft for Review
### Prepared by: IBM Bob, per Chinonye V. Chukwukere (Founder & Product Lead)
### Aligned to: PRD v1.3 · Architecture v1.7
### Internal Deadline: December 3, 2026

---

> **Document Status:** Draft — pending Product Lead review and approval.
> This document does not supersede or modify the PRD or Architecture. Three cross-document inconsistencies were identified in §9 and have been resolved in PRD v1.3 and Architecture v1.7 per Product Lead approval.

---

## Table of Contents

1. [Purpose and Scope](#1-purpose-and-scope)
2. [Competition Demo Objective](#2-competition-demo-objective)
3. [MVP Demo Scenarios](#3-mvp-demo-scenarios)
4. [Feature Classification](#4-feature-classification)
5. [Essential Features — Must-Have for MVP](#5-essential-features--must-have-for-mvp)
6. [Conditional Features — Include If On Schedule](#6-conditional-features--include-if-on-schedule)
7. [Deferred Features — Explicitly Out of MVP Scope](#7-deferred-features--explicitly-out-of-mvp-scope)
8. [Dependencies and Blocking Actions](#8-dependencies-and-blocking-actions)
9. [Inconsistencies Between PRD v1.2 and Architecture v1.6](#9-inconsistencies-between-prd-v12-and-architecture-v16)
10. [MVP Acceptance Criteria](#10-mvp-acceptance-criteria)
11. [Non-Negotiable Safety Constraints](#11-non-negotiable-safety-constraints)
12. [Four-Week Delivery Plan](#12-four-week-delivery-plan)
13. [MVP Completion Definition](#13-mvp-completion-definition)
14. [Change Log](#14-change-log)

---

## 1. Purpose and Scope

This document defines the precise scope of the Royalty Rescue AI (RRAI) competition prototype. It answers three questions:

1. **What must be built and demonstrated** to satisfy the competition submission requirements and the PRD's success criteria?
2. **What is explicitly deferred** and must not be included in the prototype?
3. **What are the concrete acceptance criteria** that confirm the MVP is complete and ready for submission?

This document is not a technical specification. It does not define database schemas, API contracts, or implementation details — those are defined in the Architecture v1.7. It does not define individual feature requirements — those are defined in the PRD v1.3. It defines the scope boundary and the completion bar.

**Governing documents (draft, pending approval):**
- PRD v1.3 — [`docs/PRD.md`](./PRD.md)
- Architecture v1.7 — [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md)
- Project Context — [`docs/PROJECT-CONTEXT.md`](./PROJECT-CONTEXT.md)

---

## 2. Competition Demo Objective

The competition prototype must demonstrate a complete, end-to-end emergency coordination workflow that directly answers the founding problem: a family searching helplessly between hospitals, losing critical time because no one had verified information about where appropriate care was available.

The demo must show that RRAI can:

| Objective | Description |
|---|---|
| **O1 — Receive the emergency** | A citizen submits a request and it reaches a trained response agent |
| **O2 — Find verified care** | The AI copilot retrieves verified hospital capability data and surfaces an evidence-based recommendation |
| **O3 — Protect against bad data** | Unavailable, unverified, or outdated hospitals are never recommended — server-side enforcement, not prompt engineering |
| **O4 — Human decides** | Every consequential action (hospital selection, dispatch, patient acceptance) requires explicit human approval |
| **O5 — Coordinate the response** | An ambulance is assigned; the receiving hospital gets a pre-arrival handover summary |
| **O6 — Accountability at every step** | An immutable audit log records all actions, AI suggestions, and human decisions with timestamp and actor attribution |
| **O7 — Two operator models** | Both Org A (independent) and Org B (112-partner) are demonstrable on the same platform with full data separation |

---

## 3. MVP Demo Scenarios

Two simulated workflows demonstrate both operating models. Both use entirely synthetic data.

### Scenario A — Independent Operator ("The Call That Saves a Life")

This is the primary demo scenario. It directly inverts the founding problem into a supported outcome.

| Step | Actor | Action |
|---|---|---|
| A1 | Citizen | Submits emergency request via citizen portal (name, location, presenting complaint, preferred language) |
| A2 | System | Creates incident record, routes to Org A dashboard, issues reference number to citizen |
| A3 | Response Agent (Org A) | Opens incident on dashboard; sees new incident with full submitted details |
| A4 | Response Agent | Queries AI copilot: *"Which hospitals near Ikeja have emergency cardiac capacity and are not currently on strike?"* |
| A5 | AI Copilot + Backend | Retrieves hospital registry, runs server-side dual-pass validation, returns ranked recommendations with cited source data |
| A6 | Response Agent | Reviews recommendations; selects a hospital; incident status advances |
| A7 | Hospital Administrator | Logs into hospital portal; confirms patient acceptance for the specific incident |
| A8 | Response Agent | Reviews acceptance confirmation; assigns available ambulance unit from synthetic roster; approves dispatch |
| A9 | System | Generates clinical handover summary; makes it visible to receiving hospital |
| A10 | Hospital Administrator | Acknowledges receipt of handover summary |
| A11 | Judge/Reviewer | Views complete audit log showing every action, AI suggestion, and human approval with timestamps |

### Scenario B — 112-Partner Operator (Mock Integration)

This is the secondary demo scenario. It demonstrates Model B and the platform's reuse across operator types.

| Step | Actor | Action |
|---|---|---|
| B1 | System (script) | Sends synthetic incident notification to mock webhook endpoint simulating a 112-partner dispatch alert |
| B2 | System | Creates incident record attributed to Org B; appears on Org B dashboard flagged as `mock_integration` |
| B3 | Response Agent (Org B) | Manages the incident through the same AI copilot, hospital registry, dispatch, and handover workflows as Org A |
| B4 | Judge/Reviewer | Confirms Org A and Org B data are completely separate; no cross-organization visibility |

> **Conditional:** Scenario B (F11) is included only if Weeks 1–3 deliverables are on schedule. If at risk, Org B is pre-configured as a read-only demonstration of multi-tenancy without the live mock webhook workflow.

---

## 4. Feature Classification

Every feature from PRD §6.1 is classified as Essential, Conditional, or Deferred.

| Feature ID | Feature Name | Classification | Priority | Rationale |
|---|---|---|---|---|
| F1 | Citizen Emergency Intake Portal | **Essential** | 🔴 P1 | Entry point to the demo; no demo without it |
| F2 | Agent Incident Dashboard | **Essential** | 🔴 P1 | Core coordination workspace; blocks F3–F8 |
| F3 | AI Emergency Copilot | **Essential** | 🔴 P1 | Primary IBM AI demonstration; competition differentiator |
| F4 | Hospital Capability Registry | **Essential** | 🔴 P1 | Knowledge source for AI copilot; required for F3 and F5 |
| F5 | Hospital Availability Management | **Essential** | 🔴 P1 | Enables the verified-data story; required for F3 server-side validation |
| F6 | Patient Acceptance Confirmation | **Essential** | 🔴 P1 | Safety constraint; non-negotiable blocking step before dispatch |
| F7 | Simulated Ambulance Dispatch | **Essential** | 🟡 P2 | Required to complete the full coordination workflow in Scenario A |
| F8 | Clinical Handover Summary | **Essential** | 🟡 P2 | Directly answers the founding problem (hospital knows patient is coming) |
| F9 | Incident Audit Log | **Essential** | 🟡 P2 | Required for G4 accountability; judges will want to see this |
| F10 | Organization Admin Panel | **Essential** | 🟢 P3 | Read-only; demonstrates multi-org architecture; low build cost |
| F11 | Model B Mock Integration | **Conditional** | 🟢 P3 | Conditional on Weeks 1–3 schedule; valuable but not blocking |

---

## 5. Essential Features — Must-Have for MVP

Each essential feature is described by what it must deliver for the demo to succeed, derived from PRD v1.2 acceptance criteria.

### F1 — Citizen Emergency Intake Portal

**Must deliver:**
- A publicly accessible web form (no login required) collecting: caller name, contact number, location (address or landmark), nature of emergency (free text), number of people affected, and preferred language.
- Consent acknowledgment before submission.
- On submission: incident created with status `new`, routed to the correct organization's agent dashboard, reference number displayed to citizen.
- Static emergency fallback message with synthetic direct-contact numbers visible in case of system unavailability.
- Limited human-reviewed Nigerian Pidgin phrases in the interface (section headers or helper text) — labeled as human-reviewed, not AI-generated.

**Minimum demo bar:** A citizen submits a form → incident appears on the correct dashboard → citizen sees a reference number.

---

### F2 — Agent Incident Dashboard

**Must deliver:**
- Incident list view showing: reference number, caller name, location, emergency type, status, time received, and assigned agent — scoped strictly to the agent's organization.
- Filterable by status: `new`, `in_progress`, `hospital_selected`, `hospital_confirmed`, `dispatched`, `en_route`, `arrived`, `closed`.
- Incident detail view showing: full submitted information, status history, AI copilot interaction log, dispatch status, and audit trail.
- Agent can update incident status and add operational notes.
- New incidents appear without full page reload (polling or websocket).

**Minimum demo bar:** Agent opens a new incident, reviews details, updates status, adds a note — all reflected in the audit log.

---

### F3 — AI Emergency Copilot

**Must deliver:**
- Natural language query input embedded in the incident detail view, accessible only to authenticated agents.
- Query processed via IBM watsonx.ai (Granite 3.x) using RAG pattern against the synthetic hospital registry.
- **Dual-pass server-side validation (non-negotiable):** pre-filter before AI call removes ineligible hospitals from context; post-filter after AI output validates every returned hospital ID against the registry for: (a) existence, (b) `confirmed` availability status, (c) current (non-`outdated`) verification timestamp, (d) matching emergency type. Any hospital failing any check is excluded from the response.
- Response displays for each recommended hospital: name, availability status, last verified timestamp, accepted emergency types, AI-generated rationale (labeled as AI-suggested).
- If no eligible hospital passes server-side validation: human escalation prompt displayed — no fallback hospital invented.
- AI suggestions visually distinct from confirmed human decisions throughout the UI.
- Agent can override a suggestion and is prompted to record a reason.
- Every query and response logged in the incident audit trail.

**Minimum demo bar:** Agent submits a natural language query → receives a cited, validated hospital recommendation → audit log shows the query and response.

**Required negative test cases for demo:**
- Query where all matching hospitals are `unavailable` → escalation prompt, no recommendation.
- Query where a hospital's status is `outdated` → hospital excluded; outdated status noted.
- Query where no hospital matches the emergency type → escalation prompt.

---

### F4 & F5 — Hospital Capability Registry and Availability Management

**Must deliver:**
- Seeded synthetic hospital dataset: approximately 12 fictional Nigerian hospitals with full capability profiles (identity, location, ED status, staff availability, bed/ICU counts, equipment, accepted emergency types, availability status, verification timestamps).
- Hospital administrator login; authenticated update of: ED operating status, specialty staff on duty, service disruption flag, bed counts, equipment status, accepted emergency types.
- Availability status lifecycle: `confirmed` → `unavailable` / `pending_confirmation` → auto-transition to `outdated` if not re-verified within 4 hours (configurable).
- Every status update records: new status, timestamp, staff member identity, optional notes.
- All registry changes logged in the hospital audit trail.
- Status changes reflected immediately in subsequent AI copilot server-side validation.

**Minimum demo bar:** Hospital admin updates ED status → change is reflected in the next AI copilot query for that hospital.

---

### F6 — Patient Acceptance Confirmation

**Must deliver:**
- Patient acceptance is a required, blocking step — dispatch cannot be marked `confirmed` without an acceptance record for the specific incident and hospital.
- Acceptance performed only by an authenticated hospital administrator — agents cannot perform this step on behalf of a hospital.
- Acceptance record captures: hospital administrator ID, timestamp, incident reference number, hospital name.
- **Post-acceptance safety control (non-negotiable, D3):** if the selected hospital's availability status changes to `unavailable` or `outdated` after acceptance but before dispatch is finalized:
  - Dispatch progression is automatically blocked.
  - A high-priority alert is displayed to the response agent.
  - Acceptance record is marked `operationally_valid = false` (original data preserved; record never deleted).
  - Agent re-verification and human approval are required before dispatch can resume.
  - If an ambulance has already been dispatched: high-priority alert issued; system does not autonomously cancel or redirect — human reassessment required.
- Acceptance records appear in both incident audit log and hospital audit trail.

**Minimum demo bar:** Hospital admin accepts a patient → agent sees confirmation → dispatch proceeds only after acceptance is confirmed.

---

### F7 — Simulated Ambulance Dispatch

**Must deliver:**
- Synthetic ambulance unit roster per organization (unit ID, name, status: `available` / `dispatched` / `unavailable`).
- Agent selects an available unit and assigns it to a confirmed incident — no automatic dispatch.
- Dispatch assignment requires agent confirmation; incident status advances to `dispatched`; unit status updates to `dispatched`.
- Dispatch action logged in audit trail with unit ID, agent ID, and timestamp.
- Agent can manually advance ambulance status: `dispatched` → `en_route` → `arrived`.

**Minimum demo bar:** Agent selects unit → confirms dispatch → incident and unit status update → dispatch action appears in audit log.

---

### F8 — Clinical Handover Summary

**Must deliver:**
- Generated automatically once dispatch is confirmed; visible to the receiving hospital's authenticated administrator.
- Summary includes: patient name (synthetic), presenting complaint, triage priority level (agent-assigned), ambulance unit ID, dispatch status, relevant agent notes, incident reference number.
- Clearly labels which fields are AI-suggested and which are agent-entered.
- Hospital administrator can acknowledge receipt; acknowledgment recorded in audit log.

**Minimum demo bar:** After dispatch confirmation, hospital admin can view the handover summary and acknowledge it; acknowledgment in audit log.

---

### F9 — Incident Audit Log

**Must deliver:**
- Every system action generates an immutable audit log entry: citizen submission, status changes, AI copilot queries and responses, hospital selection, patient acceptance, dispatch assignment, handover generation, handover acknowledgment.
- Each entry records: timestamp (UTC), actor ID, actor role, organization ID, action type, relevant entity IDs.
- AI suggestions logged separately from human decisions, with clear label.
- Agent overrides logged with override reason.
- Audit log readable by organization administrators via incident detail view.
- No entry editable or deletable by any user role — enforced at database layer (not just UI).

**Minimum demo bar:** A complete end-to-end Scenario A walkthrough produces a readable audit log with all actions, AI suggestions, and human decisions present and attributed.

---

### F10 — Organization Administration Panel

**Must deliver:**
- Pre-seeded: Org A (RapidResponse NG) and Org B (Lagos 112 Coordination Centre) with all user accounts and role assignments seeded at database level.
- Read-only screen showing: organization name, type, operational status, seeded user accounts and their assigned roles.
- Visible label indicating this is a prototype demonstration of a future onboarding capability.
- Fictional organizations labeled as fictional in all UI copy.
- Data isolation enforced server-side regardless of panel state.

**Minimum demo bar:** Org Admin can log in and view their organization's profile and user list; Org A admin cannot see Org B data.

---

## 6. Conditional Features — Include If On Schedule

### F11 — Model B Mock Integration (Scenario B)

**Condition:** Include only if all Week 1–3 deliverables are on schedule as of the end of Week 3 (November 25, 2026).

**Must deliver (if included):**
- Synthetic webhook endpoint (`POST /api/integrations/mock-112`) accepting structured JSON incident notification.
- On receipt: incident created attributed to Org B, appears on Org B dashboard, flagged as `source_type: mock_integration` in audit log.
- Same AI copilot, hospital registry, dispatch, and handover workflows available to Org B as Org A.

**Fallback if not included:** Org B exists as a pre-configured organization demonstrating multi-tenancy — agents can log in and see the empty dashboard. This is sufficient to demonstrate data isolation even without the mock webhook.

---

## 7. Deferred Features — Explicitly Out of MVP Scope

These features must not be built during the competition phase. Including them risks the four-week deadline without proportional demo value.

| Excluded Feature | Why Deferred | Roadmap Phase |
|---|---|---|
| Live Nigeria 112 integration | Requires government authorization | Phase 3 |
| Voice / telephony citizen intake | Infrastructure complexity; out of scope | Phase 2 |
| Native mobile app (iOS / Android) | Web-first sufficient for demo | Phase 2 |
| SMS / push notifications | Infrastructure dependency; not needed for demo | Phase 2 |
| Predictive hospital capacity modeling | Requires real historical data | Phase 3 |
| Live map / routing for ambulances | Third-party dependency; not essential | Phase 2 |
| Self-service organization registration | Full workflow too complex | Phase 2 |
| Multi-language AI translation | Safety risk without validation | Phase 2 |
| Real patient records | Synthetic only throughout prototype | Never (prototype) |
| User creation / role editing via UI | Too complex for four-week scope | Phase 2 |
| watsonx Assistant (conversational intake) | Deferred to post-competition | Phase 2 |
| Operational dashboards / analytics | Audit log viewer is sufficient for demo | Phase 2 |
| SSO / MFA / government ID verification | Not needed for prototype auth | Phase 2 |
| Live ambulance routing / map visualization | Not needed for simulated dispatch | Phase 2 |

---

## 8. Dependencies and Blocking Actions

The following actions from Architecture v1.7 §14 directly block MVP feature development. They are reproduced here as a delivery checklist. Owners and blocking scope are as documented in the Architecture.

### Week 1 — Must Resolve Before Any Feature Development

| Action | Owner | Blocks |
|---|---|---|
| **OA-3** — GitHub repo initialized; Next.js scaffold created | Technical Lead | All development |
| **OA-4** — Supabase project live; free tier capacity confirmed | Technical Lead | All authenticated routes, database |
| **OA-5** — IBM Cloud Code Engine account access and quota confirmed | Technical Lead | Deployment (Week 4) |
| **OA-6** — Synthetic hospital dataset reviewed for realism (~12 hospitals) | Product Lead | Data seeding; F3, F4, F5 |
| **OA-7** — `custom_access_token` Auth Hook implemented and verified in Supabase | Technical Lead | **All authenticated routes** (F2–F10) |
| **OA-9** — `SUPABASE_SERVICE_ROLE_KEY` confirmed as server-side secret only | Technical Lead | Security posture; audit features |

### Week 2 — Must Resolve Before These Features

| Action | Owner | Blocks |
|---|---|---|
| **OA-2** — watsonx.ai model ID and endpoint confirmed on team IBM Cloud account | Technical Lead | **F3 (AI Copilot)** — entire feature |
| **OA-8** — Five SQL migrations created: REVOKE INSERT on audit_log_entries; `write_with_audit()` SECURITY DEFINER; `invalidate_acceptance_record()` SECURITY DEFINER; `audit_log_immutability` trigger; GRANT/REVOKE EXECUTE | Technical Lead | **F6 (Patient Acceptance), F9 (Audit Log)** |
| **OA-10** — `invalidate_acceptance_record()` callable only via service_role; not executable by authenticated users | Technical Lead | **F6 (Patient Acceptance)** |
| **OA-11** — `auth.uid()` and `auth.jwt()` accessible inside SECURITY DEFINER via `supabase.rpc()` | Technical Lead | **F9 (Audit Log)** |

### Before Week 4 — Must Resolve for Submission

| Action | Owner | Blocks |
|---|---|---|
| **OA-1** — Official IBM AI Builders Challenge deployment requirements verified | Product Lead | Deployment target confirmation (IBM Cloud Code Engine vs. contingency) |

---

## 9. Cross-Document Inconsistencies — Resolution Record

Three inconsistencies were identified in MVP Scope v1.0 between PRD v1.2 and Architecture v1.6. All three have been resolved per Product Lead approval and are reflected in PRD v1.3 and Architecture v1.7. This section is retained as a resolution record.

---

### INC-1 — Incident Status Value: `hospital_selected` vs. `hospital_confirmed`

**Status: ✅ Resolved in PRD v1.3**

**Original finding:** PRD §8 F2.2 omitted `hospital_selected` from the incident status filter list, while Architecture §8 state machine defines a two-state sequence (`hospital_selected` → `hospital_confirmed`) that represents the patient acceptance safety gate.

**Resolution applied:** `hospital_selected` added to PRD §8 F2.2 status filter list (PRD v1.3, change log entry). The two-state sequence and the patient acceptance blocking step are preserved exactly as defined in Architecture v1.7 §8.

---

### INC-2 — Document Version Headers vs. Change Log Content

**Status: ✅ Resolved in PRD v1.3 and Architecture v1.7**

**Original finding:** PRD.md header read "Version 1.1" while change log documented changes through v1.2. ARCHITECTURE.md header read "Version 1.5" while change log documented changes through v1.6.

**Resolution applied:** PRD header and footer corrected to v1.3 (current version after INC corrections). Architecture header corrected to v1.7 (current version after INC corrections). All headers, footers, and aligned-to references now consistent across both documents.

---

### INC-3 — Ambulance Dispatcher Role in PRD vs. Architecture

**Status: ✅ Resolved in Architecture v1.7**

**Original finding:** PRD §5.1 defined Ambulance Dispatcher as a distinct business role; Architecture §7.3 RBAC table listed `ambulance_dispatcher` but the JWT claims section did not enumerate it as a valid role value.

**Resolution applied (per Product Lead decision):** Ambulance Dispatcher is retained as a distinct business role in the PRD (no change to PRD §5.1 or §5.2). Architecture v1.7 §7.2 updated to: (a) enumerate `ambulance_dispatcher` as a valid JWT `role` value alongside `response_agent`, `hospital_admin`, and `org_admin`; (b) document that for the MVP competition prototype, both `response_agent` and `ambulance_dispatcher` role claims have access to dispatch routes; (c) confirm a pre-seeded `ambulance_dispatcher` account per organization in the MVP synthetic dataset; (d) record a dedicated Ambulance Dispatcher onboarding workflow and UI panel as a Phase 2 enhancement.

---

## 10. MVP Acceptance Criteria

The MVP is complete and ready for submission when all of the following are true.

### Scenario A — End-to-End Demonstration

| ID | Acceptance Criterion |
|---|---|
| AC-01 | A citizen submits the intake form → an incident record is created with status `new` and routed to Org A's agent dashboard → the citizen sees a reference number matching the incident ID. |
| AC-02 | The response agent opens the incident and sees all submitted details; the incident is not visible on Org B's dashboard. |
| AC-03 | The agent queries the AI copilot with a natural language question; the response lists hospitals with availability status `confirmed`, current verification timestamp, matching emergency type, and AI-generated rationale clearly labeled as AI-suggested. |
| AC-04 | A hospital with status `unavailable`, `pending_confirmation`, or `outdated` does not appear in any copilot recommendation under any query — verified by running the hospital negative test cases. |
| AC-05 | When no eligible hospital passes server-side validation, the copilot returns an escalation prompt — no invented hospital recommendation. |
| AC-06 | The hospital administrator updates a hospital's ED status; the change is reflected in the next copilot query result for that hospital. |
| AC-07 | A hospital's status that has not been re-verified within 4 hours transitions to `outdated` and is automatically excluded from copilot recommendations. |
| AC-08 | The hospital administrator logs in and confirms patient acceptance for the specific incident; the acceptance record is created with administrator ID, timestamp, and incident reference. |
| AC-09 | Dispatch cannot be marked `confirmed` without a valid patient acceptance record — the system blocks the action and shows a clear error if attempted without one. |
| AC-10 | If the selected hospital's status changes to `unavailable` or `outdated` after acceptance but before dispatch is finalized, dispatch is blocked automatically and a high-priority alert is shown to the agent. |
| AC-11 | The response agent assigns an available ambulance unit and confirms dispatch; the incident status advances to `dispatched`; the unit status updates to `dispatched`. |
| AC-12 | After dispatch confirmation, the clinical handover summary is visible in the hospital administrator's view and accurately reflects the incident details and triage priority. |
| AC-13 | The hospital administrator acknowledges receipt of the handover summary; the acknowledgment is recorded in the audit log. |
| AC-14 | The complete end-to-end audit log displays every action with UTC timestamp, actor ID, actor role, organization ID, and action type — including AI queries and human decisions — with no gaps. |
| AC-15 | No audit log entry can be modified or deleted through any interface. |

### Scenario B — Multi-Organization Demonstration

| ID | Acceptance Criterion |
|---|---|
| AC-16 | Org A and Org B agents each see only their own organization's incidents; no cross-organization data is visible. |
| AC-17 | The Org Admin panel for Org A shows Org A's profile and seeded user roles; Org A admin cannot view Org B's panel. |
| AC-18 | *(Conditional — F11)* A synthetic webhook call creates an incident on Org B's dashboard flagged as `mock_integration`; the same AI copilot and dispatch workflows are available to the Org B agent. |

### Safety and Compliance

| ID | Acceptance Criterion |
|---|---|
| AC-19 | All patient names, hospital names, organizations, and incidents displayed in the prototype are fictional and labeled as such. |
| AC-20 | The AI copilot never makes an autonomous dispatch, transfer, or patient acceptance decision — every consequential action requires an explicit human approval step. |
| AC-21 | The citizen portal consent acknowledgment must be completed before the form can be submitted. |
| AC-22 | The citizen portal displays a static fallback emergency message with synthetic contact numbers, visible at all times. |
| AC-23 | `SUPABASE_SERVICE_ROLE_KEY` is not present in any client-side bundle, API response, or application log. |

---

## 11. Non-Negotiable Safety Constraints

These constraints apply throughout design, implementation, and testing. They are not negotiable and may not be relaxed for demo convenience.

| Constraint | Enforcement |
|---|---|
| Synthetic data only — no real patients, hospitals, or incidents | Database seeding with fictional records; visible labels in all UI |
| No live 112 integration | Mock webhook only; no telephony or government service connection |
| No autonomous clinical or dispatch decisions | Every consequential action has an explicit human confirmation step |
| AI copilot validated server-side | Dual-pass validation (pre-filter + post-filter) in backend API — prompt engineering is insufficient |
| Ineligible hospitals never recommended | Hospitals with status `unavailable`, `pending_confirmation`, or `outdated` excluded at server layer |
| Patient acceptance is a blocking step | Dispatch API returns error if no valid acceptance record exists |
| No autonomous ambulance cancellation or redirection | System issues alert and blocks progression only; human decision required |
| Audit log is append-only | `REVOKE INSERT` on `audit_log_entries` from `authenticated`; `write_with_audit()` SECURITY DEFINER enforces identity from JWT |
| Service role key server-side only | `SUPABASE_SERVICE_ROLE_KEY` never in `NEXT_PUBLIC_` variables, API responses, or logs |

---

## 12. Four-Week Delivery Plan

Derived from Project Context §Four-Week Schedule. Feature IDs map to §4 above.

| Week | Dates | Focus | Features / Deliverables |
|---|---|---|---|
| **Week 1** | Nov 5–11 | Foundation | OA-3 to OA-7, OA-9 resolved. Synthetic hospital dataset reviewed (OA-6). Database schema migrated. Synthetic data seeded (12 hospitals, 2 orgs, user accounts). Authentication verified end-to-end. |
| **Week 2** | Nov 12–18 | Core Features | F1 (Citizen Portal), F2 (Agent Dashboard — list + detail), F4 + F5 (Hospital Registry — admin update + search), F3 (AI Copilot — RAG query + grounded response + dual-pass validation). OA-2, OA-8, OA-10, OA-11 resolved. |
| **Week 3** | Nov 19–25 | Coordination Workflows | F6 (Patient Acceptance), F7 (Dispatch), F8 (Handover Summary), F9 (Audit Log viewer), F11 (Mock Integration — if on schedule). |
| **Week 4** | Nov 26–Dec 3 | Polish and Submission | F10 (Org Admin Panel). End-to-end testing against all AC-01–AC-23. Bug fixes. Deployment to IBM Cloud Code Engine (OA-1 resolved). Demo video (3 min). Presentation slides. Submission package. |

### Priority Order If Time Is Short

If the Week 3 scope cannot be fully completed, features are cut in reverse priority order — last to first:

| Priority | Feature | Cut If Necessary? |
|---|---|---|
| 🔴 Must ship | F1, F2, F3, F4, F5 | Never cut |
| 🔴 Must ship | F6 (Patient Acceptance) | Never cut — safety constraint |
| 🟡 Ship if possible | F7 (Ambulance Dispatch) | Cut if severely behind |
| 🟡 Ship if possible | F8 (Handover Summary) | Cut if severely behind |
| 🟡 Ship if possible | F9 (Audit Log viewer) | Backend logging must remain; viewer may be simplified |
| 🟢 Conditional | F11 (Mock Integration) | Cut first — explicitly conditional |
| 🟢 Low-cost demo | F10 (Org Admin Panel) | Pre-configure for demo even if UI not built |

---

## 13. MVP Completion Definition

The MVP is complete when:

1. All 23 acceptance criteria (AC-01 through AC-23) pass in the deployed prototype environment.
2. All essential features (F1–F10) are implemented and demonstrable end-to-end in Scenario A.
3. Scenario B is either fully demonstrable (if F11 included) or demonstrable as a data-isolated multi-tenant environment (if F11 excluded).
4. All three inconsistencies identified in §9 are resolved — confirmed by PRD v1.3 and Architecture v1.7.
5. All outstanding actions OA-1 through OA-11 are resolved or explicitly accepted as known risks.
6. The demo video, presentation slides, and submission package are ready for the competition submission deadline.

---

## 14. Change Log

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | November 2026 | IBM Bob, per Chinonye V. Chukwukere | Initial draft — aligned to PRD v1.2 and Architecture v1.6. Feature classification, acceptance criteria, dependency checklist, and three cross-document inconsistencies identified. |
| 1.1 | November 2026 | IBM Bob (per Product Lead version-alignment instruction) | Header updated to v1.1; aligned-to references updated to PRD v1.3 and Architecture v1.7; footer updated to v1.1. §13 completion criterion 4 updated to reference PRD v1.3 and Architecture v1.7 as confirmation that INC-1/INC-2/INC-3 are resolved. No requirements, acceptance criteria, or feature classifications changed. |

---

*Document prepared using IBM Bob.*
*Version 1.1 — Draft. Awaiting Product Lead review and approval.*
*Aligned to PRD v1.3 · Architecture v1.7.*
*Internal Deadline: December 3, 2026.*
