-- =============================================================================
-- Migration 004 — Security Functions and Audit Enforcement
-- RRAI — Royalty Rescue AI
-- Aligned to: Architecture v1.7 §10.1a (Layers 1b, 1c, 3, 4)
-- Run after: 003_rls.sql
-- OA-8: This migration addresses all five items in Outstanding Action OA-8.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Layer 1 — Privilege grants
-- Revoke direct INSERT on audit_log_entries from authenticated.
-- All audit writes go through write_with_audit() RPC only.
-- ---------------------------------------------------------------------------
GRANT SELECT ON audit_log_entries TO authenticated;
REVOKE UPDATE, DELETE ON audit_log_entries FROM authenticated;
REVOKE INSERT ON audit_log_entries FROM authenticated;

-- patient_acceptance_records: INSERT for hospital_admin (controlled by RLS policy)
-- No UPDATE granted to authenticated; updates go through invalidate_acceptance_record() only.
GRANT SELECT, INSERT ON patient_acceptance_records TO authenticated;
REVOKE UPDATE, DELETE ON patient_acceptance_records FROM authenticated;

-- ---------------------------------------------------------------------------
-- Layer 1b — invalidate_acceptance_record()
-- Called server-side via service_role client by the §9 safety control.
-- Targeted update of operationally_valid, invalidated_at, invalidated_reason only.
-- Original acceptance fields (accepted_by_user_id, accepted_at, hospital_id)
-- are NEVER overwritten.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION invalidate_acceptance_record(
  p_incident_id UUID,
  p_reason      TEXT
)
RETURNS void
SECURITY DEFINER
SET search_path = public, pg_catalog
LANGUAGE plpgsql AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  -- Authorization check: the referenced hospital must actually be ineligible
  -- before invalidation is permitted. Prevents arbitrary invalidation calls.
  SELECT hcp.availability_status
    INTO v_current_status
    FROM incidents i
    JOIN hospital_capability_profiles hcp
      ON hcp.hospital_id = i.selected_hospital_id
   WHERE i.id = p_incident_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'invalidate_acceptance_record: incident % not found', p_incident_id;
  END IF;

  IF v_current_status = 'confirmed' THEN
    RAISE EXCEPTION
      'invalidate_acceptance_record: hospital for incident % still has confirmed status; invalidation rejected',
      p_incident_id;
  END IF;

  -- Targeted update — preserves all original acceptance data
  UPDATE patient_acceptance_records
     SET operationally_valid  = false,
         invalidated_at       = NOW(),
         invalidated_reason   = p_reason
   WHERE incident_id          = p_incident_id
     AND operationally_valid  = true;
END;
$$;

-- Restrict execution: revoke from PUBLIC, grant to service_role only.
-- The Supabase service_role API key connects as the 'service_role' PostgreSQL role,
-- NOT as 'postgres'. Granting to service_role ensures callability from server-side
-- Next.js code using the Supabase service_role client.
REVOKE EXECUTE ON FUNCTION invalidate_acceptance_record(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION invalidate_acceptance_record(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------------
-- Layer 1c — write_with_audit()
-- All audit log writes go through this SECURITY DEFINER function.
-- Enforces actor_id, actor_role, and organization_id from the verified JWT
-- session context — never from caller-supplied arguments.
-- Architecture v1.7 §10.1a Layer 1c.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION write_with_audit(
  p_operation_data JSONB,   -- describes the triggering write
  p_audit_source   TEXT,    -- 'human' | 'ai_suggestion' | 'system'
  p_action_type    TEXT,    -- must match the approved action_type registry
  p_entity_type    TEXT,
  p_entity_id      UUID,
  p_incident_id    UUID     DEFAULT NULL,
  p_org_id         UUID     DEFAULT NULL  -- required in system-context; ignored in user-context
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
  -- Resolve identity from the caller's JWT session context.
  -- auth.uid() / auth.jwt() read from request.jwt.claims set by PostgREST.
  -- SECURITY DEFINER does NOT change the JWT session context —
  -- these values always reflect the authenticated caller's verified identity.
  v_actor_id   := auth.uid();
  v_actor_role := auth.jwt() -> 'app_metadata' ->> 'role';
  v_org_id     := (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid;

  IF v_actor_id IS NOT NULL THEN
    -- USER-CONTEXT PATH: JWT present (anon key + user token)
    -- p_org_id is ignored — caller cannot target a different org via this argument.
    IF p_audit_source NOT IN ('human', 'ai_suggestion') THEN
      RAISE EXCEPTION
        'write_with_audit: user-context calls must use source "human" or "ai_suggestion", got "%"',
        p_audit_source;
    END IF;
    -- v_actor_id, v_actor_role, v_org_id are all set from JWT above; no override.

  ELSE
    -- SYSTEM-CONTEXT PATH: No user JWT (service_role call from background job or
    -- safety trigger). p_org_id is required and validated.
    IF p_org_id IS NULL THEN
      RAISE EXCEPTION 'write_with_audit: system-context call must supply p_org_id';
    END IF;
    IF p_audit_source <> 'system' THEN
      RAISE EXCEPTION
        'write_with_audit: system-context calls must use source "system", got "%"',
        p_audit_source;
    END IF;
    -- Validate org exists
    PERFORM 1 FROM organizations WHERE id = p_org_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'write_with_audit: organization % not found', p_org_id;
    END IF;
    v_org_id     := p_org_id;
    v_actor_id   := NULL;
    v_actor_role := 'system';
  END IF;

  -- Validate action_type against approved registry
  IF p_action_type NOT IN (
    'incident_created', 'incident_status_changed',
    'copilot_query', 'copilot_response',
    'hospital_validation_excluded', 'hospital_selected', 'agent_override',
    'patient_acceptance_submitted', 'patient_acceptance_voided',
    'dispatch_assigned', 'dispatch_status_changed', 'dispatch_blocked_status_change',
    'post_acceptance_alert_issued', 'alert_acknowledged', 'agent_reverification_submitted',
    'hospital_reselected', 'dispatch_hospital_changed', 'hospital_status_changed',
    'handover_generated', 'handover_acknowledged', 'escalation_triggered',
    'language_assistance_flagged', 'copilot_escalation_no_eligible_hospitals'
  ) THEN
    RAISE EXCEPTION 'write_with_audit: unknown action_type "%"', p_action_type;
  END IF;

  INSERT INTO audit_log_entries (
    id, incident_id, organization_id, actor_id, actor_role,
    action_type, source, entity_type, entity_id, detail, created_at
  )
  VALUES (
    gen_random_uuid(), p_incident_id, v_org_id, v_actor_id, v_actor_role,
    p_action_type, p_audit_source::audit_source, p_entity_type, p_entity_id,
    p_operation_data, NOW()
  )
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

-- Authenticated users may call write_with_audit() for user-context audit writes.
-- service_role (not postgres) is the connection role used by the service_role API key.
REVOKE EXECUTE ON FUNCTION
  write_with_audit(JSONB, TEXT, TEXT, TEXT, UUID, UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION
  write_with_audit(JSONB, TEXT, TEXT, TEXT, UUID, UUID, UUID) TO authenticated;
GRANT  EXECUTE ON FUNCTION
  write_with_audit(JSONB, TEXT, TEXT, TEXT, UUID, UUID, UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Layer 4 — Immutability trigger
-- Fires BEFORE UPDATE OR DELETE on audit_log_entries for ALL roles,
-- including service_role and postgres. Cannot be bypassed by role grants.
-- Architecture v1.7 §10.1a Layer 4.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- custom_access_token Auth Hook (OA-7)
-- This function must be registered in the Supabase Auth settings as the
-- custom_access_token hook. It runs at sign-in time and injects role,
-- organization_id, and hospital_id into app_metadata JWT claims.
-- Required by Architecture v1.7 §7.2. Blocks all authenticated routes until
-- implemented (OA-7 is a blocking outstanding action).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION custom_access_token_hook(event JSONB)
RETURNS JSONB
SECURITY DEFINER
SET search_path = public, pg_catalog
LANGUAGE plpgsql AS $$
DECLARE
  v_user_id       UUID;
  v_role          TEXT;
  v_org_id        UUID;
  v_hospital_id   UUID;
  v_claims        JSONB;
BEGIN
  v_user_id := (event ->> 'user_id')::uuid;

  SELECT u.role::TEXT, u.organization_id, u.hospital_id
    INTO v_role, v_org_id, v_hospital_id
    FROM users u
   WHERE u.id = v_user_id AND u.is_active = true;

  IF NOT FOUND THEN
    -- User not yet in users table or is inactive; return event unchanged.
    -- Auth will still issue a token but without app_metadata role claims.
    RETURN event;
  END IF;

  v_claims := event -> 'claims';
  v_claims := jsonb_set(v_claims, '{app_metadata}',
    jsonb_build_object(
      'role',            v_role,
      'organization_id', v_org_id::TEXT,
      'hospital_id',     COALESCE(v_hospital_id::TEXT, 'null')
    )
  );

  RETURN jsonb_set(event, '{claims}', v_claims);
END;
$$;

-- Grant execute to supabase_auth_admin (the role Supabase Auth uses to invoke hooks)
GRANT EXECUTE ON FUNCTION custom_access_token_hook(JSONB) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION custom_access_token_hook(JSONB) FROM PUBLIC;
