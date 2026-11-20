-- =============================================================================
-- Migration 001 — Custom Enum Types
-- RRAI — Royalty Rescue AI
-- Aligned to: Architecture v1.7 §3.2
-- =============================================================================

-- Organization type and status
CREATE TYPE org_type   AS ENUM ('independent', 'national_partner');
CREATE TYPE org_status AS ENUM ('active', 'suspended');

-- User roles (matches JWT app_metadata.role claim — Architecture v1.7 §7.2)
CREATE TYPE user_role AS ENUM (
  'response_agent',
  'hospital_admin',
  'ambulance_dispatcher',
  'org_admin'
);

-- Incident lifecycle states (Architecture v1.7 §8 state machine)
CREATE TYPE incident_status AS ENUM (
  'new',
  'in_progress',
  'hospital_selected',
  'hospital_confirmed',
  'acceptance_confirmed',
  'dispatched',
  'en_route',
  'arrived',
  'alert_issued',
  'closed'
);

-- Incident source
CREATE TYPE incident_source_type AS ENUM ('citizen_portal', 'mock_integration');

-- Triage priority
CREATE TYPE triage_priority AS ENUM ('immediate', 'urgent', 'delayed', 'expectant');

-- Hospital availability status
CREATE TYPE hospital_availability_status AS ENUM (
  'confirmed',
  'unavailable',
  'pending_confirmation',
  'outdated'
);

-- Hospital ED operating status
CREATE TYPE ed_operating_status AS ENUM ('open', 'limited', 'closed');

-- Audit log source
CREATE TYPE audit_source AS ENUM ('human', 'ai_suggestion', 'system');

-- Ambulance unit status
CREATE TYPE ambulance_unit_status AS ENUM ('available', 'dispatched', 'unavailable');
