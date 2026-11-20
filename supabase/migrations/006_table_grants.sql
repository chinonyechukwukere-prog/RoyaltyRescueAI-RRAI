-- =============================================================================
-- Migration 006 — Table Privilege Grants
-- RRAI — Royalty Rescue AI
-- Aligned to: Architecture v1.7 §10.1a
-- Run after: 005_seed_synthetic_data.sql
--
-- Context: Supabase's default Postgres setup does NOT automatically grant
-- table-level privileges to the `service_role` or `authenticated` roles when
-- tables are created by a migration. RLS policies alone are insufficient —
-- the role must also have table-level SELECT/INSERT/UPDATE privileges.
--
-- `service_role` bypasses RLS (by default), but still requires explicit
-- table privileges. `authenticated` respects RLS; policies in 003_rls.sql
-- already scope what rows each user can see/write.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- service_role — used by the server-side supabaseServer client for:
--   • Citizen intake incident inserts (no user session)
--   • Mock 112 webhook incident inserts
--   • Safety control reads/writes (invalidate_acceptance_record)
--   • write_with_audit() system-context calls
--   • All copilot pre-filter hospital reads
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON organizations               TO service_role;
GRANT SELECT, INSERT, UPDATE ON users                       TO service_role;
GRANT SELECT, INSERT, UPDATE ON incidents                   TO service_role;
GRANT SELECT                 ON hospitals                   TO service_role;
GRANT SELECT, INSERT, UPDATE ON hospital_capability_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE ON patient_acceptance_records  TO service_role;
GRANT SELECT, INSERT, UPDATE ON ambulance_units             TO service_role;
GRANT SELECT, INSERT, UPDATE ON dispatch_assignments        TO service_role;
GRANT SELECT, INSERT, UPDATE ON handover_summaries          TO service_role;
GRANT SELECT, INSERT         ON copilot_interactions        TO service_role;
GRANT SELECT, INSERT         ON audit_log_entries           TO service_role;

-- ---------------------------------------------------------------------------
-- authenticated — used by the browser-side anon-key+JWT client for:
--   • Agent dashboard reads (incidents, hospitals, capability profiles)
--   • Status / triage updates on incidents
--   • Ambulance unit reads/updates
--   • Dispatch assignment inserts
--   • Handover summary inserts/updates
--   • Copilot interaction inserts
--
-- INSERT on audit_log_entries is handled by write_with_audit() SECURITY
-- DEFINER (migration 004) — authenticated has INSERT revoked on that table.
-- ---------------------------------------------------------------------------
GRANT SELECT                 ON organizations               TO authenticated;
GRANT SELECT                 ON users                       TO authenticated;
GRANT SELECT, UPDATE         ON incidents                   TO authenticated;
GRANT SELECT                 ON hospitals                   TO authenticated;
GRANT SELECT, UPDATE         ON hospital_capability_profiles TO authenticated;
-- patient_acceptance_records already granted in migration 004
GRANT SELECT, UPDATE         ON ambulance_units             TO authenticated;
GRANT SELECT, INSERT, UPDATE ON dispatch_assignments        TO authenticated;
GRANT SELECT, INSERT, UPDATE ON handover_summaries          TO authenticated;
GRANT SELECT, INSERT         ON copilot_interactions        TO authenticated;
-- audit_log_entries: SELECT granted in migration 004; INSERT/UPDATE revoked there

-- ---------------------------------------------------------------------------
-- anon — used by unauthenticated citizen portal requests for:
--   • POST /api/incidents (handled server-side via service_role, not anon)
-- No grants needed for anon on application tables.
-- ---------------------------------------------------------------------------
