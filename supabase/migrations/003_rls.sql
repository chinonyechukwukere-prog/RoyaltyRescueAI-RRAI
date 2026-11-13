-- =============================================================================
-- Migration 003 — Row-Level Security Policies
-- RRAI — Royalty Rescue AI
-- Aligned to: Architecture v1.7 §10.1a Layer 2
-- Run after: 002_tables.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enable RLS on all application tables
-- ---------------------------------------------------------------------------
ALTER TABLE organizations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitals                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospital_capability_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_acceptance_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE ambulance_units             ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_assignments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE handover_summaries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE copilot_interactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log_entries           ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Helper: extract role and org/hospital from JWT app_metadata claims
-- (set by custom_access_token Auth Hook — OA-7)
-- ---------------------------------------------------------------------------

-- organizations: org admins see only their own org
CREATE POLICY org_select_own
  ON organizations FOR SELECT
  USING (id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid);

-- users: all authenticated users can read users in their own org
CREATE POLICY users_select_own_org
  ON users FOR SELECT
  USING (organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid);

-- incidents: org-scoped read; authenticated agents and org admins
CREATE POLICY incidents_select_own_org
  ON incidents FOR SELECT
  USING (organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid);

-- incidents: INSERT is performed server-side only (citizen portal route handler
-- or webhook handler uses service_role path). Authenticated users do not directly
-- insert incidents — the route handler does so on their behalf.
-- No INSERT policy for 'authenticated' role here; service_role bypasses RLS.

-- incidents: agents may update incidents in their own org
CREATE POLICY incidents_update_own_org
  ON incidents FOR UPDATE
  USING (organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid);

-- hospitals: readable by all authenticated users (shared registry)
CREATE POLICY hospitals_select_all_authenticated
  ON hospitals FOR SELECT
  USING (auth.role() = 'authenticated');

-- hospital_capability_profiles: readable by all authenticated users
CREATE POLICY hcp_select_all_authenticated
  ON hospital_capability_profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- hospital_capability_profiles: writable only by hospital_admin for their hospital
CREATE POLICY hcp_update_own_hospital
  ON hospital_capability_profiles FOR UPDATE
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'hospital_admin'
    AND hospital_id = (auth.jwt() -> 'app_metadata' ->> 'hospital_id')::uuid
  );

-- patient_acceptance_records: INSERT for hospital_admin, their hospital only
CREATE POLICY acceptance_insert_hospital_admin
  ON patient_acceptance_records FOR INSERT
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'hospital_admin'
    AND hospital_id = (auth.jwt() -> 'app_metadata' ->> 'hospital_id')::uuid
  );

-- patient_acceptance_records: SELECT scoped to incident's org
-- (join through incidents table to enforce org isolation)
CREATE POLICY acceptance_select_own_org
  ON patient_acceptance_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM incidents i
       WHERE i.id = incident_id
         AND i.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    )
  );
-- No UPDATE policy for authenticated: updates go through invalidate_acceptance_record() only

-- ambulance_units: org-scoped
CREATE POLICY ambulance_units_select_own_org
  ON ambulance_units FOR SELECT
  USING (organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid);

CREATE POLICY ambulance_units_update_own_org
  ON ambulance_units FOR UPDATE
  USING (organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid);

-- dispatch_assignments: scoped through incident org
CREATE POLICY dispatch_select_own_org
  ON dispatch_assignments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM incidents i
       WHERE i.id = incident_id
         AND i.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    )
  );

CREATE POLICY dispatch_insert_own_org
  ON dispatch_assignments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM incidents i
       WHERE i.id = incident_id
         AND i.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    )
  );

CREATE POLICY dispatch_update_own_org
  ON dispatch_assignments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM incidents i
       WHERE i.id = incident_id
         AND i.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    )
  );

-- handover_summaries: hospital admin sees summaries for their hospital;
-- agents see summaries for their org's incidents
CREATE POLICY handover_select_agent
  ON handover_summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM incidents i
       WHERE i.id = incident_id
         AND i.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    )
  );

CREATE POLICY handover_select_hospital_admin
  ON handover_summaries FOR SELECT
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'hospital_admin'
    AND hospital_id = (auth.jwt() -> 'app_metadata' ->> 'hospital_id')::uuid
  );

CREATE POLICY handover_insert_agent
  ON handover_summaries FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM incidents i
       WHERE i.id = incident_id
         AND i.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    )
  );

-- Hospital admin acknowledges (updates acknowledged_by / acknowledged_at only)
CREATE POLICY handover_update_hospital_admin
  ON handover_summaries FOR UPDATE
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'hospital_admin'
    AND hospital_id = (auth.jwt() -> 'app_metadata' ->> 'hospital_id')::uuid
  );

-- copilot_interactions: org-scoped
CREATE POLICY copilot_select_own_org
  ON copilot_interactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM incidents i
       WHERE i.id = incident_id
         AND i.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    )
  );

CREATE POLICY copilot_insert_own_org
  ON copilot_interactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM incidents i
       WHERE i.id = incident_id
         AND i.organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid
    )
  );

-- audit_log_entries: SELECT only — org-scoped (Architecture v1.7 §10.1a Layer 2)
-- No INSERT policy: authenticated users have no direct INSERT privilege.
-- All writes go through write_with_audit() SECURITY DEFINER function (Migration 004).
CREATE POLICY audit_select_own_org
  ON audit_log_entries FOR SELECT
  USING (organization_id = (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid);
-- No UPDATE / DELETE policy: blocked by Layer 1 privilege revoke + Layer 4 trigger (Migration 004)
