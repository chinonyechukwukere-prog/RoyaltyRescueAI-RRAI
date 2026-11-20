-- =============================================================================
-- Migration 002 — Core Tables
-- RRAI — Royalty Rescue AI
-- Aligned to: Architecture v1.7 §3.2
-- Run after: 001_enums.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  type       org_type    NOT NULL,
  status     org_status  NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- users
-- id must match the Supabase Auth user UUID (set by the custom_access_token
-- Auth Hook — Architecture v1.7 §7.2 / OA-7)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id              UUID PRIMARY KEY,  -- Matches auth.uid()
  organization_id UUID        NOT NULL REFERENCES organizations(id),
  role            user_role   NOT NULL,
  name            TEXT        NOT NULL,
  email           TEXT        NOT NULL,
  hospital_id     UUID,              -- Set for hospital_admin users; NULL otherwise
  is_active       BOOLEAN     NOT NULL DEFAULT true
);

CREATE INDEX idx_users_organization_id ON users(organization_id);

-- ---------------------------------------------------------------------------
-- hospitals  (shared across organizations — read by all)
-- ---------------------------------------------------------------------------
CREATE TABLE hospitals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  address          TEXT NOT NULL,
  lga              TEXT NOT NULL,
  state            TEXT NOT NULL,
  geographic_zone  TEXT NOT NULL,
  phone            TEXT,
  email            TEXT,
  is_synthetic     BOOLEAN NOT NULL DEFAULT true  -- All MVP hospitals are fictional
);

-- ---------------------------------------------------------------------------
-- hospital_capability_profiles
-- One active profile per hospital. Written only by hospital_admin users.
-- ---------------------------------------------------------------------------
CREATE TABLE hospital_capability_profiles (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id                    UUID NOT NULL REFERENCES hospitals(id) UNIQUE,
  availability_status            hospital_availability_status NOT NULL DEFAULT 'pending_confirmation',
  ed_operating_status            ed_operating_status NOT NULL DEFAULT 'closed',
  staff_disruption_flag          BOOLEAN NOT NULL DEFAULT false,
  disruption_notes               TEXT,
  specialties_on_duty            TEXT[]   NOT NULL DEFAULT '{}',
  accepted_emergency_types       TEXT[]   NOT NULL DEFAULT '{}',
  emergency_beds_available       INTEGER  NOT NULL DEFAULT 0,
  icu_beds_available             INTEGER  NOT NULL DEFAULT 0,
  imaging_available              TEXT[]   NOT NULL DEFAULT '{}',
  blood_bank_available           BOOLEAN  NOT NULL DEFAULT false,
  ventilators_available          INTEGER  NOT NULL DEFAULT 0,
  emergency_stabilization_capable BOOLEAN NOT NULL DEFAULT false,
  last_verified_at               TIMESTAMPTZ,
  verified_by_user_id            UUID REFERENCES users(id),
  verification_source            TEXT,
  outdated_threshold_hours       INTEGER  NOT NULL DEFAULT 4,
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hcp_hospital_id ON hospital_capability_profiles(hospital_id);
CREATE INDEX idx_hcp_availability_status ON hospital_capability_profiles(availability_status);

-- ---------------------------------------------------------------------------
-- incidents
-- organization_id enforces multi-tenancy. Citizen portal submissions are
-- assigned server-side to Org A (DEFAULT_CITIZEN_ORG_ID env var).
-- Field names align with Tarun's RRAI-ENGINE IncidentRequestDto (snake_case)
-- and the Architecture v1.7 §4 API contract.
-- ---------------------------------------------------------------------------
CREATE TABLE incidents (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             UUID NOT NULL REFERENCES organizations(id),
  status                      incident_status NOT NULL DEFAULT 'new',
  source_type                 incident_source_type NOT NULL DEFAULT 'citizen_portal',
  -- Caller details (synthetic only in prototype)
  caller_name                 TEXT NOT NULL,
  caller_phone                TEXT NOT NULL,
  location_description        TEXT NOT NULL,
  lga                         TEXT NOT NULL,
  emergency_type              TEXT NOT NULL,
  presenting_complaint        TEXT NOT NULL,
  persons_affected            INTEGER NOT NULL DEFAULT 1,
  preferred_language          TEXT NOT NULL DEFAULT 'en',
  -- Agent-managed fields
  language_assistance_required BOOLEAN NOT NULL DEFAULT false,
  assigned_agent_id           UUID REFERENCES users(id),
  selected_hospital_id        UUID REFERENCES hospitals(id),
  triage_priority             triage_priority,
  -- Reference number shown to citizen (format: RRAI-YYYYMMDD-NNNN)
  reference_number            TEXT NOT NULL UNIQUE,
  -- Timestamps
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incidents_organization_id ON incidents(organization_id);
CREATE INDEX idx_incidents_status           ON incidents(status);
CREATE INDEX idx_incidents_reference_number ON incidents(reference_number);

-- ---------------------------------------------------------------------------
-- patient_acceptance_records
-- Append-only semantics for the core acceptance fields.
-- Only operationally_valid, invalidated_at, and invalidated_reason may
-- change — and only via invalidate_acceptance_record() SECURITY DEFINER fn.
-- ---------------------------------------------------------------------------
CREATE TABLE patient_acceptance_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id          UUID NOT NULL REFERENCES incidents(id),
  hospital_id          UUID NOT NULL REFERENCES hospitals(id),
  accepted_by_user_id  UUID NOT NULL REFERENCES users(id),
  accepted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                TEXT,
  operationally_valid  BOOLEAN NOT NULL DEFAULT true,
  invalidated_at       TIMESTAMPTZ,
  invalidated_reason   TEXT
);

CREATE INDEX idx_par_incident_id ON patient_acceptance_records(incident_id);
CREATE INDEX idx_par_hospital_id ON patient_acceptance_records(hospital_id);

-- ---------------------------------------------------------------------------
-- ambulance_units
-- Synthetic units per organization. Seeded at startup.
-- ---------------------------------------------------------------------------
CREATE TABLE ambulance_units (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  unit_name       TEXT NOT NULL,
  status          ambulance_unit_status NOT NULL DEFAULT 'available',
  is_synthetic    BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_ambulance_units_org_id ON ambulance_units(organization_id);
CREATE INDEX idx_ambulance_units_status ON ambulance_units(status);

-- ---------------------------------------------------------------------------
-- dispatch_assignments
-- ---------------------------------------------------------------------------
CREATE TABLE dispatch_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id     UUID NOT NULL REFERENCES incidents(id),
  ambulance_unit_id UUID NOT NULL REFERENCES ambulance_units(id),
  assigned_by_user_id UUID NOT NULL REFERENCES users(id),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          ambulance_unit_status NOT NULL DEFAULT 'dispatched',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dispatch_incident_id ON dispatch_assignments(incident_id);

-- ---------------------------------------------------------------------------
-- handover_summaries
-- ---------------------------------------------------------------------------
CREATE TABLE handover_summaries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id       UUID NOT NULL REFERENCES incidents(id),
  hospital_id       UUID NOT NULL REFERENCES hospitals(id),
  generated_by_user_id UUID NOT NULL REFERENCES users(id),
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Summary content
  patient_name      TEXT NOT NULL,
  presenting_complaint TEXT NOT NULL,
  triage_priority   triage_priority,
  ambulance_unit_id UUID REFERENCES ambulance_units(id),
  dispatch_status   TEXT,
  agent_notes       TEXT,
  -- Acknowledgment (hospital admin)
  acknowledged_by_user_id UUID REFERENCES users(id),
  acknowledged_at   TIMESTAMPTZ
);

CREATE INDEX idx_handover_incident_id ON handover_summaries(incident_id);
CREATE INDEX idx_handover_hospital_id ON handover_summaries(hospital_id);

-- ---------------------------------------------------------------------------
-- copilot_interactions
-- Records every AI copilot query and response. Append-only in practice.
-- ---------------------------------------------------------------------------
CREATE TABLE copilot_interactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id     UUID NOT NULL REFERENCES incidents(id),
  agent_id        UUID NOT NULL REFERENCES users(id),
  query_text      TEXT NOT NULL,
  response_json   JSONB,               -- Full validated response payload
  escalation_required BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_copilot_incident_id ON copilot_interactions(incident_id);

-- ---------------------------------------------------------------------------
-- audit_log_entries
-- Append-only. No UPDATE or DELETE granted to any application role.
-- All inserts go through write_with_audit() SECURITY DEFINER function.
-- See Migration 004 for enforcement.
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id     UUID REFERENCES incidents(id),     -- Nullable for org-level actions
  organization_id UUID NOT NULL REFERENCES organizations(id),
  actor_id        UUID REFERENCES users(id),          -- Nullable for system-generated entries
  actor_role      TEXT,                               -- Copied at write time; not a live FK
  action_type     TEXT NOT NULL,
  source          audit_source NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  detail          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_incident_id      ON audit_log_entries(incident_id);
CREATE INDEX idx_audit_log_organization_id  ON audit_log_entries(organization_id);
CREATE INDEX idx_audit_log_actor_id         ON audit_log_entries(actor_id);
CREATE INDEX idx_audit_log_action_type      ON audit_log_entries(action_type);
CREATE INDEX idx_audit_log_created_at       ON audit_log_entries(created_at);
