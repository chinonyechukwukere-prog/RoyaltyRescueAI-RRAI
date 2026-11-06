# Royalty Rescue AI (RRAI) — Project Context & Planning Record

> **Status:** Active Planning — PRD not yet finalized. Do not treat any section as approved requirements until explicitly confirmed.
>
> **Internal Deadline:** December 3, 2026 · **Schedule:** Four weeks from November 5, 2026

---

## Competition Context

- **Competition:** 2026 IBM AI Builders Challenge – North America
- **Category:** AI for Good (proposed)
- **Primary Toolchain:** IBM Bob must be used for planning, documentation, architecture, code generation, implementation, testing, and debugging throughout the project lifecycle.
- **Submission format:** Not yet confirmed. Planning for three scenarios: (a) live deployed web app, (b) video walkthrough + documentation, (c) GitHub repository + recorded demo.
- **Official competition deadline:** Not yet confirmed — separate from internal deadline.
- **Internal deadline:** December 3, 2026 (fixed). Four-week schedule starting November 5, 2026.
- **Required submission deliverables:** Working prototype, three-minute demo video, presentation slides, documentation.

---

## The Problem

A young Nigerian experiencing a life-threatening emergency was taken to a hospital where doctors were on strike. His family moved from one facility to another without knowing which hospital had available staff, equipment, or capacity. Critical time was lost. He died before receiving care.

**The core failure was informational, not clinical.** The right care may have existed nearby — but finding it in real time was impossible.

Royalty Rescue AI proposes an AI-assisted coordination layer that:
- Connects emergency callers to trained human response agents
- Provides agents with a verified, real-time view of hospital capabilities
- Supports ambulance dispatch coordination
- Delivers clinical handover information to receiving hospitals before the patient arrives
- Logs every decision for accountability and audit

---

## Project Vision

> Build an intelligent emergency coordination platform that connects patients, emergency response agents, ambulance providers, and hospitals — reducing avoidable delays between an emergency and appropriate medical care.
>
> *In an emergency, finding help should not become another emergency.*

---

## Operating Model — Hybrid Multi-Channel Architecture

RRAI supports two complementary operating models that share one platform:

### Model A — Independent Emergency Coordination
Private ambulance services, healthcare networks, NGOs, and authorized emergency coordinators operate RRAI as a standalone platform. No dependency on Nigeria's 112 infrastructure. Organizations onboard directly, configure their resources, and manage incidents independently.

### Model B — National Infrastructure Integration Pathway
RRAI is architected to support future authorized integration with Nigeria's 112 emergency communications infrastructure and other national or state emergency agencies. This integration is subject to formal authorization, partnerships, and technical interoperability agreements — and is **not active during the prototype phase**.

For the competition, both models are demonstrated through **simulated workflows using synthetic data**:
- One scenario shows an independent operator receiving a citizen request.
- A second scenario simulates a 112-partner operator receiving an incident through a mock integration interface.

---

## Core Actors

| Actor | Role |
|---|---|
| **Citizen / Caller** | Submits an emergency request via web or mobile portal |
| **Response Agent (Independent)** | Trained human coordinator at a private or NGO emergency service; manages incidents through the RRAI dashboard |
| **Response Agent (112-Partner)** | Authorized 112 operator or partner agency coordinator using RRAI capabilities through a simulated integration interface |
| **AI Copilot** | IBM watsonx-powered assistant that retrieves hospital capabilities, suggests resources, and summarizes incidents — never decides autonomously |
| **Hospital Administrator** | Authorized hospital staff who update verified emergency resource availability (staffing status, equipment, capacity) |
| **Ambulance Dispatcher** | Assigns and tracks ambulance units; approves dispatch in coordination with the response agent |
| **Organization Administrator** | Configures the organization's RRAI instance, manages users, sets access controls, and reviews audit logs |
| **System / Audit Log** | Immutable record of all actions, AI suggestions, human approvals, overrides, and escalations |

---

## Multi-Tenancy and Data Separation

- RRAI is a **multi-organization platform**: each operator organization (independent service or 112-partner) operates within its own data boundary.
- Cross-organization data is never exposed without explicit authorization.
- Role-based access control (RBAC) governs what each user type can see and act upon within their organization.
- Future external integration interfaces are defined but not active during the prototype.

---

## Safety and Scope Constraints (Non-Negotiable)

- Use **synthetic data only**: fictional patients, hospitals, incidents, and ambulance units during prototyping.
- **No live integration** with Nigeria's 112 emergency services during the prototype phase.
- **No autonomous clinical or dispatch decisions.** Every consequential action requires human agent approval.
- AI outputs are always presented as **suggestions with cited sources**, not directives.
- All AI suggestions, human approvals, overrides, and escalations are **logged with timestamps and actor attribution**.
- Privacy and consent requirements apply: lawful processing grounds must be documented for all personal data categories.
- Emergency escalation safeguards must be defined: what happens if RRAI is unavailable or an agent is unresponsive.

---

## Team

### Chinonye V. Chukwukere — Founder, Product Lead

**Professional background:**
- Certified Business Analyst with 5+ years of experience on enterprise applications, digital solutions, customer experience platforms, CRM systems, and business process improvement.
- Led requirements gathering, stakeholder engagement, functional requirements documentation, user stories, acceptance criteria, and technical specifications.
- Supported end-to-end product delivery: discovery → solution design → implementation → UAT → delivery.
- Agile/Scrum methodology, process mapping, workflow optimization, cross-functional technology teams.
- Enterprise CRM and digital transformation experience in Oil & Gas and eCommerce.

**Academic background:**
- Pursuing M.S. Information Systems Technology, George Washington University.
- Coursework: AI and IoT analytics (Python, Apache Spark), cloud applications, cybersecurity and risk management, database design and SQL, web development (HTML/CSS/PHP), Python programming, project management, systems analysis.

**Tools and platforms:**
- Salesforce CRM, Jira, Azure DevOps, Power BI, Tableau, Excel, IBM Bob.

**RRAI responsibilities:**
- Product strategy, problem discovery, requirements engineering
- User experience planning and workflow design
- Feature prioritization and scope management
- All product documentation (PRD, user stories, acceptance criteria, UX flows)
- Stakeholder research and competition presentation narrative
- Acceptance testing and quality validation
- Architecture discussions, technical decision reviews
- IBM Bob-driven planning, documentation, and implementation coordination

---

### Team Member 2 — Technical Lead *(name not yet provided)*

**Background:**
- Master of Science in Management Information Systems.
- Experience in software development, cloud computing, and backend technologies.
- Particular interest and experience in AI and ML.

**RRAI responsibilities:**
- Backend architecture design and implementation
- IBM watsonx.ai integration (LLM + RAG pipeline)
- Cloud infrastructure and deployment (IBM Cloud)
- Database design and implementation (PostgreSQL / Supabase)
- API design and development
- AI/ML pipeline construction and testing
- IBM Bob–generated code review, integration, and validation

---

### Team Member 3 — Domain Expert *(not yet confirmed)*

**Anticipated background:** Healthcare operations, emergency response, or clinical expertise relevant to Nigeria's emergency care system.

**Anticipated RRAI contributions:**
- Validate clinical handover language and triage priority logic
- Review synthetic scenario realism against actual Nigerian emergency response conditions
- Nigeria 112 system context and operational constraints
- Medical terminology accuracy in AI copilot knowledge base

---

## Recommended Technology Stack

> **Status:** Recommended — not yet approved by team. Subject to change.

| Layer | Choice | Rationale |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) + Tailwind CSS + shadcn/ui | IBM Bob generates React/Next.js cleanly; shadcn/ui provides accessible production-quality components with no design overhead |
| **Backend** | Next.js API Routes (unified repo) | Reduces deployment complexity; IBM Bob generates Node.js/TypeScript well; suitable for small team |
| **Database** | PostgreSQL via Supabase | Managed, free tier, built-in auth, REST and realtime APIs, zero infrastructure overhead |
| **AI Copilot — LLM** | IBM watsonx.ai with Granite 3.x | IBM-native, strongest competition alignment, solid instruction-following for structured agent tasks |
| **AI Copilot — Knowledge** | watsonx.ai RAG (Document Grounding) | Synthetic hospital registry as grounded knowledge; copilot retrieves and cites, cannot hallucinate capacity data |
| **Authentication** | Supabase Auth | Role-based (citizen, agent, hospital admin); built in, minimal code |
| **Deployment** | IBM Cloud (Code Engine) | Directly on IBM infrastructure; strengthens competition story; container-based and straightforward |
| **Version Control** | GitHub | Standard; enables IBM Bob to read/write code across sessions |

### IBM AI Services — Recommended Configuration

**Primary — IBM watsonx.ai (Granite 3.x):**
- Powers the AI copilot embedded in the agent dashboard
- Processes natural language queries from agents (e.g., *"Which hospitals near Ikeja have ICU capacity and are not on strike?"*)
- Returns structured, cited recommendations from the synthetic hospital registry
- All responses presented as agent suggestions — never autonomous decisions

**Knowledge Retrieval — watsonx.ai RAG pattern:**
- Synthetic hospital data (name, location, specialties, status, equipment) stored as structured knowledge documents
- Copilot retrieves relevant records and grounds every response — no hallucinated capacity data
- Simplest reliable pattern for MVP; achievable with IBM Bob generating the integration

**Optional / Phase 2 — watsonx Assistant:**
- Conversational citizen intake (chat or voice interface)
- Recommended as stretch goal after core agent dashboard is complete

---

## Hospital Capability Registry — Approved Requirements

The hospital registry is the authoritative knowledge source for the AI copilot. All copilot responses about hospital availability must be grounded in this registry — the copilot must never invent availability, capabilities, or patient acceptance status.

### Required Data Attributes (MVP)

| Category | Fields |
|---|---|
| **Identity & Location** | Hospital name, address, LGA, state, geographic zone, contact details |
| **Emergency Department Status** | Operating status (open / closed / limited), last verified timestamp, verified by (staff member name/ID), verification source |
| **Medical Staff Availability** | Relevant specialties on duty, service disruption flag (e.g. strike, walkout), disruption notes |
| **Bed & ICU Capacity** | Emergency beds available (count), ICU beds available (count), overflow status |
| **Equipment & Services** | Imaging available (X-ray / CT / MRI), blood bank status, ventilators available (count), emergency stabilization capability flag |
| **Emergency Reception Types** | Accepted emergency categories: cardiac, trauma, obstetric, pediatric, neurological, burns, general medical |
| **Availability Status** | Enum: `confirmed` / `unavailable` / `pending_confirmation` / `outdated` |
| **Patient Acceptance** | Explicit confirmation that the hospital accepts a specific patient before dispatch is finalized; human approval required |
| **Audit Trail** | Timestamped log of all status changes, who made the change, and patient acceptance decisions |

### Business Rules

- A hospital's availability status expires and becomes `outdated` if not re-verified within a configurable time window (default: 4 hours for MVP).
- The AI copilot must surface the verification timestamp and status alongside any recommendation.
- If no hospital with `confirmed` status matches the patient's needs, the system must surface a human escalation prompt — it must not automatically select an `unavailable` or `pending_confirmation` facility.
- Patient acceptance confirmation is a distinct, explicit step separate from resource search. A hospital appearing in search results is not automatically confirmed to receive the patient.
- All patient acceptance decisions are attributed to a named hospital administrator and timestamped in the audit log.

---

## Four-Week Schedule — Internal Milestone Plan

> **Start:** November 5, 2026 · **Internal Deadline:** December 3, 2026

| Week | Dates | Focus | Key Deliverables |
|---|---|---|---|
| **Week 1** | Nov 5–11 | Foundation | PRD approved, Architecture approved, Data model designed, Synthetic data seeded, Project scaffolded |
| **Week 2** | Nov 12–18 | Core Features | Citizen intake portal, Agent dashboard (incident list + detail), Hospital registry (admin update + search), AI copilot (RAG query + grounded response) |
| **Week 3** | Nov 19–25 | Coordination Workflows | Ambulance dispatch (simulated), Clinical handover summary, Incident status lifecycle, Audit log, Scenario B mock integration stub |
| **Week 4** | Nov 26–Dec 3 | Polish & Submission | End-to-end testing, Bug fixes, Deployment to IBM Cloud, Demo video (3 min), Presentation slides, Submission package |

### Priority Order (If Time Is Short)

1. 🔴 **AI emergency copilot** — hospital capability search with grounded RAG responses
2. 🔴 **Verified hospital availability management** — admin interface + status lifecycle
3. 🔴 **Citizen emergency intake** — web portal submission
4. 🔴 **Agent dashboard** — incident reception, AI copilot access, dispatch approval
5. 🟡 **Simulated ambulance dispatch** — assignment and status tracking
6. 🟡 **Clinical handover summary** — pre-arrival patient summary to hospital
7. 🟡 **Audit log viewer** — visible decision trail
8. 🟢 **Scenario B mock integration** — 112-partner stub (only if Weeks 1–3 are on schedule)
9. 🟢 **Organization admin panel** — user management (pre-configured for demo if time is short)

---

## Proposed Documentation Plan

| Document | Purpose | Status |
|---|---|---|
| `PRD.md` | Full feature scope, actors, user stories, acceptance criteria | ⏳ Pending 2 clarification answers |
| `ARCHITECTURE.md` | System components, data flows, IBM services used | ⏳ Pending PRD approval |
| `MVP-SCOPE.md` | Specific competition demo scope, cut list, success criteria | ⏳ Pending PRD approval |
| `DATA-MODEL.md` | Synthetic hospital, patient, incident schemas | ⏳ Pending architecture approval |
| `AI-DESIGN.md` | Copilot design: prompts, knowledge base, guardrails, human-in-the-loop gates | ⏳ Pending architecture approval |
| `UX-FLOWS.md` | Wireframe descriptions for each actor interface | ⏳ Pending PRD approval |
| `TEST-PLAN.md` | Simulation scenarios, success and failure cases | ⏳ After MVP scope approval |
| `SUBMISSION.md` | Competition narrative, demo script, IBM Bob usage evidence | ⏳ Last milestone |

---

## Multilingual Accessibility — Approved Requirements

RRAI is designed as a multilingual emergency healthcare coordination platform serving Nigeria's diverse population.

### MVP (Four-Week Scope)
- English is the primary operational language across all interfaces.
- Limited, human-reviewed Nigerian Pidgin phrases included in the citizen portal to demonstrate local context awareness.
- Frontend architecture uses an i18n-ready structure (e.g. locale files, translation keys) to support future languages without architectural changes.
- Emergency incident record includes a `preferred_language` field.
- Response agents can record when a caller requires language assistance (free-text or dropdown flag on the incident record).
- Unsupported languages are never presented as functional. No unvalidated AI-generated medical translations are displayed.

### Future Roadmap (Post-Competition)
- Multilingual speech recognition and text-to-speech for citizen intake.
- Machine translation with human validation safeguards for emergency-critical content.
- Qualified interpreter escalation pathway.
- Full language support: Hausa, Yoruba, Igbo, Fulfulde, Kanuri, and additional regional languages.
- All emergency-critical translations undergo domain-appropriate human validation before activation.

---

## Organization Onboarding — Approved Requirements

### MVP (Four-Week Scope)
Two pre-configured fictional organizations are seeded directly in the database:

| Organization | Type | Purpose |
|---|---|---|
| **Org A — RapidResponse NG** | Independent emergency medical coordination provider | Demonstrates Model A; receives citizen-initiated requests |
| **Org B — Lagos 112 Coordination Centre** | Simulated 112-partner emergency coordination center | Demonstrates Model B; receives incidents via mock integration |

- Both organizations use the same RRAI platform with full data separation between them.
- A lightweight read-only Organization Administration screen displays: organization profile, type, status, and assigned user roles.
- The screen is a demonstration of the future onboarding concept, not a functional registration flow.
- No self-service registration, identity verification, or organization approval workflow is built for the MVP.
- Fictional organizations are not represented as actual authorized emergency service providers.

### Future Roadmap (Post-Competition)
- Secure self-service organization onboarding and profile setup.
- Identity and credential verification for emergency service providers.
- Government or regulatory authorization workflow.
- Administrative approval and activation process.
- Role-based access management per organization.
- Organization suspension and deactivation capabilities.

---

## Open Questions

All blocking questions are resolved. The PRD may now be drafted.

### Resolved Questions
- ✅ **112 framing** — Hybrid model confirmed: independent operation + future 112 integration pathway. Both demonstrated through synthetic simulation in competition.
- ✅ **Competition deadline** — Internal deadline fixed: December 3, 2026. Four-week schedule from November 5.
- ✅ **Hospital data model** — Full capability profile confirmed. Requirements documented above.
- ✅ **IBM AI services** — IBM watsonx.ai (Granite 3.x) with RAG pattern. watsonx Assistant deferred to Phase 2.
- ✅ **Team composition** — Chinonye (Product Lead) + Technical Lead (MIS/backend/AI). Domain expert not yet confirmed.
- ✅ **Language** — English primary; limited human-reviewed Pidgin in citizen portal; i18n-ready architecture; full localization roadmap documented.
- ✅ **Organization onboarding** — Two pre-configured synthetic orgs; read-only admin panel placeholder; full onboarding workflow deferred to post-competition roadmap.
- ✅ **Existing assets** — None identified in workspace. All documentation is being created from scratch using IBM Bob.

---

## Recommended MVP Scenario

Two simulated workflows share the same platform and demonstrate both operating models.

### Scenario A — Independent Operator ("The Call That Saves a Life")
This scenario directly inverts the founding tragedy into a successful outcome.

1. Citizen submits an emergency request (name, location, presenting symptoms) via the citizen portal.
2. An independent emergency coordination organization receives the alert; a response agent picks it up on the dashboard.
3. The agent queries the AI copilot: *"Which hospitals near Ikeja have emergency cardiac capacity and are not currently on strike?"*
4. The copilot retrieves from the synthetic hospital registry and returns ranked recommendations with cited evidence.
5. The agent selects a hospital — the incident status updates to "Hospital Confirmed / En Route."
6. An ambulance unit is assigned from the synthetic dispatch roster; the agent approves the dispatch.
7. A pre-arrival clinical handover summary is generated and visible to the receiving hospital's admin portal.
8. The full audit log records every action, AI suggestion, agent decision, and timestamp.

### Scenario B — 112-Partner Operator (Mock Integration)
This scenario demonstrates the national infrastructure integration pathway.

1. A simulated inbound incident notification arrives via a mock 112 integration interface (a synthetic webhook or API call — no live telephony).
2. A response agent at the 112-partner organization receives the alert in the same shared dashboard, configured for their organization.
3. The same AI copilot, hospital registry, and dispatch coordination flows are used — demonstrating platform reuse across operator types.
4. The audit log attributes all actions to the 112-partner organization, keeping data separated from the independent operator.

---

*Last updated by IBM Bob — Planning session, November 2026.*
*Next action: Answer 3 remaining open questions → Draft PRD.*
