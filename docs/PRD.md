# Product Requirements Document
# Royalty Rescue AI (RRAI)
### Version 1.3 — Revised Draft for Review
### Prepared by: Chinonye V. Chukwukere, Founder & Product Lead
### Toolchain: IBM Bob (Primary)
### Internal Deadline: December 3, 2026
### Revision: Quality review applied per Product Lead instruction — see Change Log

---

> **Document Status:** Draft — pending team review and approval.
> No feature described in this document is approved for implementation until this document is formally reviewed and signed off.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Product Vision and Goals](#3-product-vision-and-goals)
4. [Operating Model](#4-operating-model)
5. [Actors and User Roles](#5-actors-and-user-roles)
6. [Scope and Boundaries](#6-scope-and-boundaries)
7. [Safety and Compliance Constraints](#7-safety-and-compliance-constraints)
8. [Feature Requirements](#8-feature-requirements)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Multilingual Accessibility Requirements](#10-multilingual-accessibility-requirements)
11. [Future Roadmap](#11-future-roadmap)
12. [Assumptions and Dependencies](#12-assumptions-and-dependencies)
13. [Risks and Mitigations](#13-risks-and-mitigations)
14. [Glossary](#14-glossary)

---

## 1. Executive Summary

Royalty Rescue AI (RRAI) is an AI-assisted emergency medical response coordination platform designed to reduce preventable delays between a medical emergency and appropriate clinical care.

RRAI connects citizens, trained human response agents, ambulance providers, and hospitals through a shared coordination workspace, supported by an IBM watsonx-powered AI copilot that retrieves verified hospital capability information, surfaces resource options, and assists agents in coordinating appropriate emergency response — always subject to human approval.

The platform is designed for Nigeria's emergency healthcare context, where information failures — not the absence of care — are frequently the cause of preventable patient deaths. RRAI addresses this by making verified hospital readiness, ambulance availability, and coordinated clinical handover accessible through a single, auditable coordination workspace.

This document defines the product requirements for the competition MVP, to be completed by December 3, 2026, and submitted to the 2026 IBM AI Builders Challenge – North America under the AI for Good category. IBM Bob is the primary tool used throughout the product lifecycle.

---

## 2. Problem Statement

A young, talented Nigerian was experiencing a life-threatening medical emergency. His family rushed him to the nearest hospital, hoping he would receive immediate treatment. When they arrived, they were told that the doctors were on strike.

Desperate, his family began searching for another hospital. They moved from one facility to another, losing precious minutes without knowing which hospital had available medical personnel, the necessary equipment, or the capacity to treat his condition.

He died before receiving the care he needed.

**The core failure was informational, not clinical.** The right care may have existed nearby. The gap was the absence of a coordination layer that could answer — in real time — which facility could actually receive him.

### Problem Dimensions

| Dimension | Description |
|---|---|
| **Information gap** | No real-time visibility into hospital staffing, equipment, and capacity status |
| **Coordination gap** | No shared workspace connecting callers, agents, hospitals, and ambulance services |
| **Handover gap** | Receiving hospitals have no advance notice of the patient's condition or needs |
| **Accountability gap** | No audit trail of decisions made during the emergency, making quality improvement impossible |
| **Access gap** | Emergency coordination services are inaccessible to citizens without technical literacy or a smartphone |

---

## 3. Product Vision and Goals

> *Build an intelligent emergency coordination platform that connects patients, emergency response agents, ambulance providers, and hospitals — reducing avoidable delays between an emergency and appropriate medical care.*
>
> *In an emergency, finding help should not become another emergency.*

### Product Goals

| Goal | Description |
|---|---|
| **G1 — Reduce information delays** | Provide agents with verified, structured hospital capability data in seconds, not minutes |
| **G2 — Human-led, AI-assisted** | The AI copilot augments agent judgment — it never makes autonomous clinical or dispatch decisions |
| **G3 — Verified handover** | Receiving hospitals know the patient's condition, ETA, and triage priority before arrival |
| **G4 — Full accountability** | Every action, AI suggestion, and human decision is logged immutably with actor attribution |
| **G5 — Deployable at scale** | Multi-organization architecture supports independent operators and future national infrastructure integration |

### Success Criteria for Competition MVP

- A citizen can submit an emergency request and it appears on the agent dashboard within the prototype.
- An agent can query the AI copilot with a natural language question and receive a grounded, cited hospital recommendation.
- A hospital administrator can update their facility's emergency availability status and the change is reflected in AI copilot results.
- An agent can confirm hospital selection, approve ambulance dispatch, and generate a clinical handover summary — all in one workflow.
- The audit log displays every decision with timestamp and actor attribution.
- Both synthetic organizations (Org A and Org B) are demonstrable in the same platform with separate data.

---

## 4. Operating Model

RRAI supports two complementary operating models that share one platform and one codebase.

### Model A — Independent Emergency Coordination

Private ambulance services, healthcare networks, NGOs, and authorized emergency coordinators operate RRAI as a standalone platform, independent of any national infrastructure. Organizations configure their resources, manage incidents, and coordinate with hospitals entirely within RRAI.

**MVP representative organization:** Org A — RapidResponse NG (fictional independent emergency medical coordination provider).

### Model B — National Infrastructure Integration Pathway

RRAI is architecturally designed to support future authorized integration with Nigeria's 112 emergency communications infrastructure and partner agencies. This model requires formal authorization, partnerships, and technical interoperability agreements and is **not active during the prototype phase**.

For the competition, Model B is demonstrated through a simulated inbound incident notification delivered via a mock API/webhook — no live telephony or government service connection.

**MVP representative organization:** Org B — Lagos 112 Coordination Centre (fictional simulated 112-partner coordination center).

### Shared Platform Principles

- Both organizations use the same agent dashboard, AI copilot, hospital registry, and audit log.
- Patient and incident data is separated at the database level by organization ID.
- Cross-organization data is never exposed without explicit authorization.
- Role-based access control governs what each user can see and act upon within their organization.

---

## 5. Actors and User Roles

### 5.1 Role Definitions

| Role | Description | Access Scope |
|---|---|---|
| **Citizen** | Member of the public submitting an emergency request via the citizen portal | Public portal only; no dashboard access |
| **Response Agent** | Trained human coordinator managing active incidents via the agent dashboard | Incidents, AI copilot, dispatch, handover — within their organization |
| **Hospital Administrator** | Authorized hospital staff member updating and verifying the facility's emergency availability | Hospital registry admin interface for their facility only |
| **Ambulance Dispatcher** | Coordinator assigning ambulance units to confirmed incidents | Dispatch panel within their organization |
| **Organization Administrator** | Views organization profile, assigned users, and roles in the read-only admin panel (MVP). Full user and role management deferred to Phase 2. | Organization-scoped read-only admin panel (MVP) |
| **System Audit Log** | Not a human actor; the immutable system record of all actions | Read access for authorized administrators |

### 5.2 Role Permissions Matrix

| Action | Citizen | Response Agent | Hospital Admin | Amb. Dispatcher | Org Admin |
|---|---|---|---|---|---|
| Submit emergency request | ✅ | — | — | — | — |
| View incident dashboard | — | ✅ | — | — | ✅ (read) |
| Query AI copilot | — | ✅ | — | — | — |
| Select hospital for incident | — | ✅ (approve) | — | — | — |
| Update hospital availability | — | — | ✅ | — | — |
| Confirm patient acceptance | — | — | ✅ | — | — |
| Assign ambulance unit | — | ✅ (approve) | — | ✅ | — |
| Generate handover summary | — | ✅ | — | — | — |
| View organization profile | — | — | — | — | ✅ |
| Manage users and roles | — | — | — | — | ❌ MVP: read-only; Phase 2 |
| View audit log | — | — | — | — | ✅ |

---

## 6. Scope and Boundaries

### 6.1 In Scope — Competition MVP

| # | Feature Area | Description |
|---|---|---|
| F1 | Citizen Emergency Intake Portal | Web form for submitting emergency requests |
| F2 | Agent Incident Dashboard | Incident list, detail view, status management |
| F3 | AI Emergency Copilot | Natural language hospital search with grounded RAG responses |
| F4 | Hospital Capability Registry | Structured hospital data with admin update interface |
| F5 | Hospital Availability Management | Status lifecycle, verification timestamps, expiry |
| F6 | Patient Acceptance Confirmation | Explicit hospital acceptance step before dispatch |
| F7 | Simulated Ambulance Dispatch | Unit assignment and status tracking (synthetic) |
| F8 | Clinical Handover Summary | Pre-arrival patient summary generated for receiving hospital |
| F9 | Incident Audit Log | Immutable timestamped log of all actions and decisions |
| F10 | Organization Admin Panel | Read-only placeholder showing org profile and user roles |
| F11 | Model B Mock Integration | Synthetic incident injection via mock webhook for Org B |

### 6.2 Out of Scope — Competition MVP

| Excluded Feature | Reason | Roadmap Phase |
|---|---|---|
| Live Nigeria 112 integration | Requires government authorization; not prototypeable | Phase 3 |
| Voice / telephony intake | Infrastructure complexity; out of four-week scope | Phase 2 |
| Mobile native app (iOS/Android) | Web-first approach sufficient for demo; time constraint | Phase 2 |
| SMS/push notifications | Infrastructure dependency; not needed for demo | Phase 2 |
| Predictive hospital capacity modeling | Requires real historical data | Phase 3 |
| Live map routing for ambulances | Third-party dependency; not essential to demo story | Phase 2 |
| Self-service organization registration | Full workflow too complex for four-week scope | Phase 2 |
| Multi-language AI translation | Safety risk without validation; deferred | Phase 2 |
| Real patient records | Must use synthetic data throughout prototype | Never (prototype) |

---

## 7. Safety and Compliance Constraints

These constraints are non-negotiable and must be enforced throughout design, implementation, and testing.

### 7.1 Synthetic Data Requirement

- All patients, hospitals, incidents, ambulance units, and organizations used during prototyping are fictional.
- No real patient data, real hospital data, or real emergency incident data may be used.
- Synthetic data must be clearly labeled as fictional in all interfaces and documentation.

### 7.2 Human-in-the-Loop Mandate

- The AI copilot may suggest, retrieve, rank, and summarize — it may never dispatch, transfer, or confirm a patient.
- Every consequential coordination action (hospital selection, dispatch approval, patient acceptance) requires an explicit human approval step.
- The UI must make the distinction between an AI suggestion and a confirmed human decision visually unambiguous.

### 7.3 AI Grounding and Hallucination Prevention

- AI copilot responses about hospital availability, staffing, equipment, or capacity must be sourced exclusively from the structured hospital registry.
- The copilot must cite its source (hospital name, last verified timestamp, and availability status) alongside every recommendation.
- **Server-side validation is mandatory:** before any hospital recommendation is returned to the agent, the backend must validate the hospital identifier, capability match, availability status (`confirmed`), and verification timestamp against the authoritative hospital registry. Prompt engineering alone is not sufficient to prevent hallucination.
- Only hospitals with a current, verified `confirmed` status and clinical capabilities matching the incident's emergency type may be included as eligible recommendations. Hospitals with status `unavailable`, `pending_confirmation`, or `outdated` must be excluded from the eligible recommendation set — they may only be surfaced as informational background if explicitly requested by the agent.
- If no hospital with `confirmed` status and matching capabilities is found, the copilot must surface a human escalation prompt with suggested next steps. It must not fabricate alternatives or present ineligible hospitals as viable options.
- AI-generated recommendation content must be clearly labeled as AI-suggested. Retrieved registry facts (availability status, verified timestamp, capability attributes) must be clearly labeled as sourced from the registry.
- Human-confirmed decisions must be visually and semantically distinct from AI suggestions throughout the UI and audit log.
- Unsupported languages must never be presented as functional. No unvalidated AI-generated medical translations may be displayed.

### 7.4 Audit and Accountability

- Every action taken in the system — including AI suggestions, agent approvals, overrides, hospital updates, and dispatch assignments — must be recorded in an immutable audit log.
- Audit entries must include: timestamp, actor ID and role, organization ID, action type, and relevant entity IDs.
- Agents must be able to document the reason for overriding an AI suggestion.

### 7.5 Privacy and Data Protection

- Lawful processing grounds must be documented for all categories of personal data collected (name, location, presenting symptoms, contact details).
- Consent or equivalent lawful basis must be obtained at the point of citizen intake.
- Data minimization applies: collect only what is operationally necessary.

### 7.6 Emergency Escalation Safeguard

- If RRAI is unavailable or an agent is unresponsive, the system must display a visible fallback: direct contact numbers for the relevant emergency services (synthetic for prototype).
- No incident should be left in an unattended state without a documented escalation pathway.

---

## 8. Feature Requirements

### F1 — Citizen Emergency Intake Portal

**Purpose:** Provide a simple, accessible web interface for citizens to submit emergency requests.

**User Story:** As a citizen experiencing or witnessing a medical emergency, I want to submit an emergency request quickly so that a trained response agent can coordinate help on my behalf.

**Functional Requirements:**

| ID | Requirement |
|---|---|
| F1.1 | The portal must be accessible via a web browser without requiring account registration. |
| F1.2 | The intake form must collect: caller name, contact number, location (address or landmark), nature of emergency (free text), and number of people affected. |
| F1.3 | The form must include a `preferred_language` field (dropdown: English, Nigerian Pidgin, Hausa, Yoruba, Igbo, Other). |
| F1.4 | On submission, the system must create an incident record with status `new` and route it to the appropriate organization's agent dashboard. |
| F1.5 | The citizen must receive a visible confirmation that their request was received, including a reference number. |
| F1.6 | The citizen portal must include limited, human-reviewed Nigerian Pidgin phrases to demonstrate local accessibility (e.g., form section headers or helper text). |
| F1.7 | Consent for data processing must be presented and acknowledged before submission. |
| F1.8 | The portal must display a static emergency fallback message with synthetic direct-contact numbers in case of system unavailability. |

**Acceptance Criteria:**
- A submitted form creates an incident record visible on the agent dashboard within the prototype session.
- The reference number displayed to the citizen matches the incident ID in the dashboard.
- The preferred language field value is stored on the incident record.
- The Pidgin phrases are labeled in documentation as human-reviewed, not AI-generated.

---

### F2 — Agent Incident Dashboard

**Purpose:** Provide response agents with a unified workspace to receive, manage, and resolve emergency incidents.

**User Story:** As a response agent, I want a clear, organized dashboard showing all active incidents so that I can prioritize my response and take coordinated action without losing track of any case.

**Functional Requirements:**

| ID | Requirement |
|---|---|
| F2.1 | The dashboard must display a list of active incidents with: reference number, caller name, location, emergency type, status, time received, and assigned agent. |
| F2.2 | Incidents must be filterable by status: `new`, `in_progress`, `hospital_selected`, `hospital_confirmed`, `dispatched`, `en_route`, `arrived`, `closed`. |
| F2.3 | Clicking an incident must open a detail view showing all submitted information, status history, AI copilot interaction log, dispatch status, and audit trail. |
| F2.4 | Agents must be able to update incident status and add operational notes. |
| F2.5 | The incident detail view must include a language assistance flag that agents can set when a caller requires language support. |
| F2.6 | The dashboard must display only incidents belonging to the agent's organization. |
| F2.7 | New incidents must appear on the dashboard within the prototype session (real-time or near-real-time via polling or websocket). |

**Acceptance Criteria:**
- An incident submitted via the citizen portal appears on the correct organization's dashboard.
- An agent can open the incident, review all details, update the status, and add a note — all reflected in the audit log.
- Incidents from Org A and Org B are not visible to agents from the other organization.

---

### F3 — AI Emergency Copilot

**Purpose:** Provide response agents with an AI-powered assistant that retrieves verified hospital capability information and surfaces resource options — always as suggestions requiring human approval.

**User Story:** As a response agent managing an active emergency, I want to ask the AI copilot which hospitals near the patient can receive them, so that I can make an informed decision quickly without manually searching multiple sources.

**Functional Requirements:**

| ID | Requirement |
|---|---|
| F3.1 | The AI copilot is embedded in the incident detail view and accessible only to authenticated response agents. |
| F3.2 | Agents must be able to submit natural language queries (e.g., "Which hospitals near Ikeja have cardiac emergency capacity?"). |
| F3.3 | The copilot must retrieve hospital data exclusively from the structured hospital registry using a RAG pattern powered by IBM watsonx.ai. |
| F3.3a | **Server-side validation (non-negotiable):** the backend API must validate every hospital in a copilot response against the registry before returning results to the client — confirming that: (a) the hospital ID exists in the registry, (b) the availability status is `confirmed`, (c) the verification timestamp is current (not `outdated`), and (d) the hospital's accepted emergency types include the incident's emergency category. Hospitals failing any check are excluded from the response. |
| F3.4 | Every copilot response must include for each recommended hospital: hospital name, availability status, last verified timestamp, accepted emergency types, and a brief AI-generated rationale clearly labeled as AI-suggested. |
| F3.5 | Hospitals with status `unavailable`, `pending_confirmation`, or `outdated` must be excluded from the eligible recommendation set. They must not appear as primary, secondary, or fallback recommendations. |
| F3.6 | If no hospital passes server-side validation as eligible (confirmed, current, capability-matched), the copilot must return a human escalation prompt. It must not fabricate alternatives. |
| F3.7 | All copilot queries and responses must be logged in the incident audit trail. |
| F3.8 | The UI must visually distinguish AI suggestions from confirmed human decisions (e.g., labeling, color differentiation). |
| F3.9 | Agents must be able to override any copilot suggestion and must be prompted to record a brief reason for the override. |

**Acceptance Criteria:**
- A natural language query returns a ranked list of hospitals with cited registry data; all recommendations have been server-side validated as `confirmed`, current, and capability-matched.
- A hospital with status `unavailable`, `pending_confirmation`, or `outdated` does not appear in the recommendation list under any circumstances.
- When no eligible hospital exists, the escalation prompt is displayed — no fallback hospital is invented.
- Every copilot interaction appears in the incident audit log with the query text, response summary, and a record of which hospitals were validated vs. excluded.
- An agent override is recorded in the audit log with the override reason.

**Negative Test Cases (required):**
- Query where all matching hospitals are `unavailable` → escalation prompt displayed, no recommendation.
- Query where matching hospital's status is `outdated` → hospital excluded from results; outdated status noted in escalation context.
- Query where no hospital in the registry matches the emergency type → escalation prompt displayed.
- Query where hospital ID in AI-generated text does not exist in registry → backend rejects the result; escalation prompt displayed.
- Query where hospital data is contradictory (confirmed status but zero emergency beds) → server-side validation excludes hospital; agent notified.

---

### F4 & F5 — Hospital Capability Registry and Availability Management

**Purpose:** Maintain a verified, structured registry of hospital emergency capabilities that serves as the authoritative knowledge source for the AI copilot and agent decisions.

**User Story (Hospital Administrator):** As a hospital administrator, I want to update my facility's emergency availability status so that emergency coordinators and the AI system have accurate, verified information before directing patients to us.

**User Story (Response Agent):** As a response agent, I want to see a hospital's verified capability profile — including what the AI copilot retrieved — so that I can make an informed decision about the right facility for this patient.

**Functional Requirements:**

| ID | Requirement |
|---|---|
| F4.1 | The hospital registry stores the full capability profile as defined in the Hospital Capability Registry requirements (see PROJECT-CONTEXT.md). |
| F4.2 | Hospital administrators must be able to log in and update their facility's emergency availability status. |
| F4.3 | Each status update must record: new status value, timestamp, staff member name/ID, and optional verification notes. |
| F4.4 | Availability status must be one of: `confirmed`, `unavailable`, `pending_confirmation`, `outdated`. |
| F4.5 | A hospital's availability status automatically transitions to `outdated` if not re-verified within 4 hours (configurable). |
| F4.6 | Hospital administrators must be able to update: ED operating status, specialty staff on duty, service disruption flag, bed counts, equipment status, and accepted emergency types. |
| F4.7 | All hospital registry changes must be recorded in the hospital audit trail. |
| F5.1 | The agent dashboard must display the hospital's current availability status and last verification timestamp when reviewing AI copilot results. |
| F5.2 | A hospital must explicitly confirm it can receive a specific patient (patient acceptance step) before dispatch or transfer is finalized. |
| F5.3 | Patient acceptance confirmation must be performed by an authenticated hospital administrator and recorded with their identity and timestamp. |

**Acceptance Criteria:**
- A hospital administrator can log in, update the ED status, and the change is immediately reflected in subsequent AI copilot server-side validation.
- A hospital whose status transitions to `outdated` is automatically excluded from eligible copilot recommendations; the `outdated` status is visible to the agent if they request background information on that hospital.
- The patient acceptance confirmation step is a required, blocking step — dispatch status cannot advance to `confirmed` without it.
- All hospital status changes appear in the hospital's audit trail with actor identity and timestamp.

**Negative Test Cases (required):**
- Attempt to finalize dispatch without patient acceptance → system blocks the action and displays a clear error.
- Hospital status expires to `outdated` during an active incident → the hospital is removed from eligible recommendations; the agent is notified to re-verify or escalate.
- Hospital administrator attempts to accept a patient for a closed ED → system must either block the action or require the administrator to explicitly override with a documented reason.

---

### F6 — Patient Acceptance Confirmation

Patient acceptance is a required, blocking workflow step — not a peripheral component. Its requirements are defined in F5.2 and F5.3. The following additional constraints apply:

| ID | Requirement |
|---|---|
| F6.1 | The system must prevent ambulance dispatch from being marked `confirmed` unless a patient acceptance record exists for the selected hospital and the specific incident. |
| F6.2 | Patient acceptance is performed by an authenticated hospital administrator — it cannot be performed by a response agent on behalf of the hospital. |
| F6.3 | The acceptance record must capture: hospital administrator ID, timestamp, incident reference number, and hospital name. |
| F6.4 | If the selected hospital's availability status changes to `unavailable` or `outdated` after patient acceptance but before dispatch is finalized, the system must: (a) automatically block dispatch progression, (b) display a high-priority alert to the response agent, and (c) require agent re-verification and human approval before dispatch can resume. If an ambulance has already been dispatched, the system must raise a high-priority alert requiring human reassessment and escalation — the system must not autonomously cancel or redirect an active ambulance. All status changes, alerts, approvals, and overrides must be recorded in the immutable audit trail. |
| F6.5 | Patient acceptance records must appear in both the incident audit log and the hospital audit trail. |

---

### F7 — Simulated Ambulance Dispatch

**Purpose:** Allow agents to assign a synthetic ambulance unit to a confirmed incident and track its status through the coordination workflow.

**User Story:** As a response agent, once a hospital is confirmed and the patient acceptance is received, I want to assign an ambulance unit and record the dispatch so that everyone in the coordination chain can see the patient is on their way.

**Functional Requirements:**

| ID | Requirement |
|---|---|
| F7.1 | The system maintains a synthetic list of ambulance units per organization (name, unit ID, current status: `available` / `dispatched` / `unavailable`). |
| F7.2 | Agents can select an available unit from the list and assign it to a confirmed incident. |
| F7.3 | Dispatch assignment requires agent confirmation — no automatic dispatch. |
| F7.4 | Once dispatched, incident status updates to `dispatched`. The assigned unit's status updates to `dispatched`. |
| F7.5 | Dispatch assignment is recorded in the incident audit log (unit ID, agent ID, timestamp). |
| F7.6 | Agents can manually update the ambulance status to `en_route` and `arrived` as the incident progresses. |

**Acceptance Criteria:**
- An agent can select and confirm an ambulance assignment; the incident status and unit status both update correctly.
- Dispatch action is logged in the audit trail.
- No ambulance is dispatched without explicit agent confirmation.

---

### F8 — Clinical Handover Summary

**Purpose:** Generate a structured pre-arrival summary for the receiving hospital so clinical staff can prepare before the patient arrives.

**User Story:** As a hospital preparing to receive an emergency patient, I want to see a structured summary of the patient's condition and ETA so that the right team, equipment, and room can be ready when they arrive.

**Functional Requirements:**

| ID | Requirement |
|---|---|
| F8.1 | Once dispatch is confirmed, the system generates a clinical handover summary visible to the receiving hospital's authenticated administrator. |
| F8.2 | The summary must include: patient name (synthetic), presenting complaint, triage priority level (agent-assigned), ambulance unit ID, estimated status (dispatched/en route), relevant notes from the agent, and the incident reference number. |
| F8.3 | The summary must display which fields were AI-suggested and which were agent-entered. |
| F8.4 | The receiving hospital administrator must be able to acknowledge receipt of the handover summary. |
| F8.5 | Acknowledgment is recorded in the incident audit log. |

**Acceptance Criteria:**
- After dispatch confirmation, the handover summary is visible in the hospital administrator's view.
- The summary accurately reflects the incident details and triage priority.
- Hospital acknowledgment is recorded in the audit log.

---

### F9 — Incident Audit Log

**Purpose:** Provide a complete, immutable record of every action, AI suggestion, and human decision made during an incident's lifecycle.

**Functional Requirements:**

| ID | Requirement |
|---|---|
| F9.1 | Every system action must generate an audit log entry: citizen submission, status changes, AI copilot queries and responses, hospital selection, patient acceptance, dispatch assignment, handover generation, and handover acknowledgment. |
| F9.2 | Each entry must record: timestamp (UTC), actor ID, actor role, organization ID, action type, and relevant entity IDs. |
| F9.3 | AI suggestions must be logged separately from human decisions, with a clear label distinguishing the two. |
| F9.4 | Agent overrides of AI suggestions must be logged with the override reason. |
| F9.5 | The audit log must be readable by organization administrators via the incident detail view. |
| F9.6 | Audit log entries must not be editable or deletable by any user role. |

**Acceptance Criteria:**
- A complete end-to-end walkthrough of Scenario A generates a readable audit log with all actions, AI suggestions, and human decisions present and correctly attributed.
- No audit entry can be modified or deleted through any interface.

---

### F10 — Organization Administration Panel

**Purpose:** Demonstrate the multi-organization architecture and future onboarding concept to competition judges.

> **MVP Scope Note:** This panel is read-only. User creation, role editing, and self-service onboarding are intentionally excluded from the competition MVP and are deferred to Phase 2. The permissions matrix row "Manage users and roles" reflects the Phase 2 capability, not the MVP implementation.

**Functional Requirements:**

| ID | Requirement |
|---|---|
| F10.1 | Two pre-configured synthetic organizations are seeded in the database: Org A (RapidResponse NG) and Org B (Lagos 112 Coordination Centre). All user accounts and role assignments are seeded alongside the organizations. |
| F10.2 | An organization administration screen displays: organization name, type, operational status, and a read-only list of seeded user accounts with their assigned roles. |
| F10.3 | The screen is strictly read-only for the competition MVP — no creation, editing, or deletion of organizations, users, or roles via the UI. |
| F10.4 | The screen must include a visible label indicating it is a prototype demonstration of a future onboarding and administration capability. |
| F10.5 | Fictional organizations must be identified as fictional in any visible UI copy. |
| F10.6 | Organization-level data isolation is enforced server-side on all API routes regardless of the read-only panel state. Role-based access control is enforced by the backend, not derived from UI state. |

---

### F11 — Model B Mock Integration (Scenario B)

**Purpose:** Demonstrate the 112-partner integration pathway through a simulated inbound incident notification.

**Functional Requirements:**

| ID | Requirement |
|---|---|
| F11.1 | A synthetic webhook endpoint accepts a structured JSON incident notification representing a simulated 112-partner dispatch alert. |
| F11.2 | On receipt, the system creates an incident record attributed to Org B and it appears on Org B's agent dashboard. |
| F11.3 | The incident is flagged with source type `mock_integration` in the audit log. |
| F11.4 | The same AI copilot, hospital registry, dispatch, and handover workflows available to Org A are available to Org B agents. |
| F11.5 | This feature is implemented only if Weeks 1–3 deliverables are on schedule. |

---

## 9. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NF1 | Performance | The AI copilot must return a response within 10 seconds of a query submission under normal prototype conditions. |
| NF2 | Availability | The prototype must remain accessible for the duration of the competition demo and evaluation window. |
| NF3 | Security | Role-based access control must be enforced server-side on all API routes. Unauthenticated users may only access the citizen intake portal. UI-level access restrictions are supplementary — they do not substitute for server-side enforcement. |
| NF4 | Data Isolation | Org A and Org B data must be isolated at the database query layer using organization ID scoping on all data access. No cross-organization data leakage is permitted. |
| NF5 | Auditability | The audit log must be append-only. No update or delete operations are permitted on audit entries by any user role or system process. |
| NF6 | Localization-Readiness | Frontend must use a translation key architecture (i18n) so additional languages can be added without component-level code changes. |
| NF7 | Accessibility | Core interfaces must meet WCAG 2.1 AA accessibility standards for color contrast and keyboard navigation. |
| NF8 | Browser Support | The web application must function correctly in current versions of Chrome, Firefox, and Edge. |
| NF9 | Deployment | The preferred and intended deployment target is IBM Cloud (Code Engine). IBM Cloud deployment directly supports the competition's IBM AI Builders Challenge narrative and must be the primary deployment path. |
| NF10 | Deployment Contingency | If IBM Cloud deployment is blocked by quota, configuration, or technical constraints, the contingency is: frontend to Vercel, backend/API to Railway or equivalent. Any contingency deployment must be documented and confirmed as permissible under the official competition rules before use. The team must verify competition deployment requirements against the official challenge guidelines. |

---

## 10. Multilingual Accessibility Requirements

### MVP Implementation

| ID | Requirement |
|---|---|
| ML1 | English is the primary operational language across all interfaces. |
| ML2 | The citizen portal includes limited, human-reviewed Nigerian Pidgin English phrases (e.g., section headers and helper text). These phrases must be documented as human-reviewed, not AI-generated. |
| ML3 | The frontend uses an i18n translation key architecture to support future language additions without component-level code changes. |
| ML4 | The emergency incident data model includes a `preferred_language` field (string, ISO language tag or custom enum). |
| ML5 | The agent dashboard incident view includes a language assistance flag: a toggleable field agents can activate when a caller requires language support. |
| ML6 | No unsupported language is presented as functional in the UI. |
| ML7 | No unvalidated AI-generated translations of emergency-critical content are displayed in any interface. |

### Future Roadmap

- Multilingual speech recognition and text-to-speech for citizen intake.
- Validated machine translation with human oversight for emergency-critical content.
- Qualified interpreter escalation pathway accessible to agents.
- Full localization: Hausa, Yoruba, Igbo, Fulfulde, Kanuri, and additional Nigerian languages.
- All emergency-critical translations undergo domain-appropriate human validation before activation.

---

## 11. Future Roadmap

The following capabilities are intentionally excluded from the competition MVP to maintain achievable scope. They represent the product's growth trajectory.

| Phase | Feature | Description |
|---|---|---|
| Phase 2 | Voice/telephony citizen intake | IVR and voice-based emergency intake, reducing dependence on literacy and internet access |
| Phase 2 | Mobile app for ambulance crews | Native iOS/Android app for real-time dispatch updates and patient handover |
| Phase 2 | SMS/push notifications | Automated status updates to patients, agents, and hospitals |
| Phase 2 | Self-service organization registration | Secure onboarding with identity verification and authorization workflows |
| Phase 2 | Live map routing | Real-time ambulance routing and ETA calculation |
| Phase 2 | Full multilingual support | Hausa, Yoruba, Igbo, Fulfulde, Kanuri; validated translation pipeline |
| Phase 2 | watsonx Assistant integration | Conversational citizen intake via chat or voice |
| Phase 3 | Live Nigeria 112 integration | Authorized real-time data exchange with national emergency infrastructure |
| Phase 3 | Predictive hospital capacity modeling | ML-based forecasting of hospital surge and capacity constraints |
| Phase 3 | Multi-state / national rollout | Regional deployment with state-specific hospital registries and agency configurations |
| Phase 3 | Community health worker integration | Extend coordination to CHW networks in underserved areas |

---

## 12. Assumptions and Dependencies

### Assumptions

| # | Assumption |
|---|---|
| A1 | IBM watsonx.ai (Granite 3.x) is available and accessible to the team via IBM Cloud during the development period. |
| A2 | Supabase free tier is sufficient for the prototype's data volume and concurrency. |
| A3 | The competition evaluates based on the prototype demo video, documentation, and deployed application — not a live judge interaction with the system. |
| A4 | The synthetic hospital dataset (approximately 10–15 fictional hospitals) is sufficient to demonstrate the AI copilot's capability matching. |
| A5 | No third-party emergency service API keys, government credentials, or healthcare data licenses are required for the prototype. |
| A6 | IBM Bob can generate sufficient implementation scaffolding to keep manual coding within the Technical Lead's capacity across four weeks. |

### Dependencies

| # | Dependency | Owner | Risk if Unavailable |
|---|---|---|---|
| D1 | IBM watsonx.ai API access and credentials | Technical Lead | AI copilot feature blocked entirely |
| D2 | IBM Cloud account and Code Engine deployment quota | Technical Lead | Deployment blocked; fallback to Vercel |
| D3 | Supabase project setup and connection strings | Technical Lead | Database layer blocked |
| D4 | GitHub repository initialized and shared | Product Lead | Version control and IBM Bob file access blocked |
| D5 | PRD and Architecture document approval | Product Lead | Implementation cannot start |

---

## 13. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| watsonx.ai RAG integration takes longer than planned | Medium | High | Start integration in Week 1 alongside data model; use static mock responses as fallback for demo if needed |
| Server-side hospital validation logic is more complex than anticipated | Medium | High | Define the validation API contract in the Architecture document before implementation begins; build and test validation layer before connecting the AI copilot |
| Hospital registry data model too complex for four weeks | Low | Medium | Full attribute set is defined; MVP UI exposes ~8 core fields; remaining fields are schema-present but not surfaced in the UI |
| AI copilot returns hallucinated hospital data despite RAG | Low | Critical | Server-side validation (F3.3a) is the primary safeguard — not prompt engineering alone; all copilot responses are validated against the registry before being returned to the client |
| Patient dispatch confirmed without hospital acceptance | Low | Critical | F6.1 enforces a blocking server-side check; dispatch status advancement requires a valid acceptance record |
| Scope creep delays core features | High | High | Priority stack is explicit (F1–F6 are non-negotiable for end-to-end demo); F11 is conditional on Week 1–3 delivery |
| IBM Cloud deployment complexity delays demo availability | Medium | Medium | IBM Cloud (Code Engine) is the preferred target; contingency deployment (NF10) is documented but must be verified as competition-compliant before use |
| Competition rules require specific IBM Cloud deployment | Medium | High | Verify official IBM AI Builders Challenge deployment and submission requirements against the competition guidelines before Week 4 |
| Third team member not confirmed in time | Medium | Low | All MVP features are scoped for a two-person team; third member adds value but is not on the critical path |
| Demo video production time underestimated | Medium | High | Reserve full Nov 26–Dec 3 week for polish and video; no new features after Nov 25 |

---

## 14. Glossary

| Term | Definition |
|---|---|
| **RRAI** | Royalty Rescue AI — the platform described in this document |
| **AI Copilot** | The IBM watsonx.ai-powered assistant embedded in the agent dashboard; provides grounded suggestions only |
| **Incident** | An emergency coordination case initiated by a citizen request or mock integration notification |
| **Hospital Registry** | The structured database of synthetic hospital capability profiles used as the AI copilot's knowledge source |
| **RAG** | Retrieval-Augmented Generation — the AI pattern where the LLM retrieves from a structured knowledge source before generating a response |
| **Availability Status** | The current operational state of a hospital for emergency reception: `confirmed`, `unavailable`, `pending_confirmation`, or `outdated` |
| **Patient Acceptance** | The explicit, human-performed step where a hospital administrator confirms the facility can receive a specific patient |
| **Handover Summary** | A structured pre-arrival document transmitted to the receiving hospital containing the patient's condition, triage priority, and ETA |
| **Model A** | Independent Emergency Coordination operating model |
| **Model B** | National Infrastructure Integration Pathway operating model |
| **Org A** | RapidResponse NG — fictional independent emergency coordination organization used in the prototype |
| **Org B** | Lagos 112 Coordination Centre — fictional simulated 112-partner organization used in the prototype |
| **LGA** | Local Government Area — the sub-state administrative unit used for geographic location in Nigeria |
| **Audit Log** | The immutable, append-only record of all system actions and decisions |
| **i18n** | Internationalization — the practice of designing software to support multiple languages without code changes |

---

---

## 15. Change Log

| Version | Date | Author | Summary of Changes |
|---|---|---|---|
| 1.0 | November 2026 | Chinonye V. Chukwukere / IBM Bob | Initial draft |
| 1.1 | November 2026 | IBM Bob (quality review per Product Lead instruction) | Applied six correction areas: hospital availability filtering, server-side AI validation, MVP scope priority clarification, org admin permissions consistency fix, IBM Cloud deployment distinction, NF10 contingency caveat added. |
| 1.2 | November 2026 | IBM Bob (per Product Lead D1–D4 approval) | F6.4 updated with approved post-acceptance dispatch safety behavior (D3). Architecture decisions D1–D4 recorded as approved. Outstanding action: verify IBM AI Builders Challenge official deployment requirements (D2). |
| 1.3 | November 2026 | IBM Bob (per Product Lead INC-1/INC-2/INC-3 resolution) | (INC-1) F2.2 status filter list updated: `hospital_selected` added before `hospital_confirmed` to align with Architecture §8 state machine and preserve the patient acceptance safety gate. (INC-2) Version header and footer corrected to v1.2. (INC-3) No change to PRD — Ambulance Dispatcher is retained as a distinct business role. MVP clarification note: for the competition prototype, an authorized Response Agent may perform dispatch functions; a separate `ambulance_dispatcher` account and JWT role claim is a potential Phase 2 enhancement. Documented in Architecture v1.7. |

---

*Document prepared using IBM Bob.*
*Version 1.3 — Revised Draft. Awaiting team review and approval.*
*Internal Deadline: December 3, 2026.*
