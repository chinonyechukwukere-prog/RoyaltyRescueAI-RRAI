-- =============================================================================
-- Migration 005 — Synthetic Seed Data
-- RRAI — Royalty Rescue AI Competition Prototype
-- Aligned to: Architecture v1.7 §13, PRD v1.3, MVP Scope v1.1
-- Run after: 004_security_functions.sql
--
-- ALL DATA IS FICTIONAL. No real patients, hospitals, organizations, or
-- emergency incidents are represented. Labeled with is_synthetic = true.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Seed Organizations (MVP Scope v1.1 §3 — two pre-configured synthetic orgs)
-- ---------------------------------------------------------------------------
-- NOTE: UUIDs are fixed for local dev / demo. Replace with your Supabase
-- project's actual org UUIDs after initial migration and update
-- DEFAULT_CITIZEN_ORG_ID and WEBHOOK_ORG_B_ID env vars accordingly.

INSERT INTO organizations (id, name, type, status) VALUES
  (
    'aaaaaaaa-0001-0001-0001-000000000001',
    'RapidResponse NG',
    'independent',
    'active'
  ),
  (
    'bbbbbbbb-0002-0002-0002-000000000002',
    'Lagos 112 Coordination Centre',
    'national_partner',
    'active'
  );

-- ---------------------------------------------------------------------------
-- Seed Synthetic Users
-- NOTE: These user records must match Supabase Auth user IDs created via the
-- Supabase Auth dashboard or admin API. The UUIDs below are placeholders —
-- replace with actual Supabase Auth user UUIDs after creating accounts.
-- The custom_access_token Auth Hook (Migration 004 / OA-7) will inject these
-- users' roles and org IDs into their JWTs at sign-in time.
-- ---------------------------------------------------------------------------

-- Org A — RapidResponse NG users
INSERT INTO users (id, organization_id, role, name, email, hospital_id, is_active) VALUES
  (
    'cccccccc-0001-0001-0001-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'org_admin',
    'Adaeze Okonkwo (Synthetic)',
    'adaeze.orgadmin@rapidresponse-ng.synthetic',
    NULL,
    true
  ),
  (
    'cccccccc-0001-0001-0001-000000000002',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'response_agent',
    'Emeka Nwosu (Synthetic)',
    'emeka.agent@rapidresponse-ng.synthetic',
    NULL,
    true
  ),
  (
    'cccccccc-0001-0001-0001-000000000003',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'ambulance_dispatcher',
    'Chidi Okafor (Synthetic)',
    'chidi.dispatcher@rapidresponse-ng.synthetic',
    NULL,
    true
  );

-- Org B — Lagos 112 Coordination Centre users
INSERT INTO users (id, organization_id, role, name, email, hospital_id, is_active) VALUES
  (
    'cccccccc-0002-0002-0002-000000000001',
    'bbbbbbbb-0002-0002-0002-000000000002',
    'org_admin',
    'Fatima Bello (Synthetic)',
    'fatima.orgadmin@lagos112.synthetic',
    NULL,
    true
  ),
  (
    'cccccccc-0002-0002-0002-000000000002',
    'bbbbbbbb-0002-0002-0002-000000000002',
    'response_agent',
    'Tunde Adeyemi (Synthetic)',
    'tunde.agent@lagos112.synthetic',
    NULL,
    true
  );

-- ---------------------------------------------------------------------------
-- Seed Synthetic Hospitals (~12 fictional Nigerian hospitals)
-- Names, addresses, and all details are entirely fictional.
-- is_synthetic = true is required on all records.
-- ---------------------------------------------------------------------------
INSERT INTO hospitals (id, name, address, lga, state, geographic_zone, phone, email, is_synthetic) VALUES
  ('dddddddd-0001-0001-0001-000000000001', 'Sunrise Emergency Hospital (Synthetic)',       '14 Broad Street, Lagos Island',    'Lagos Island', 'Lagos',    'Lagos Island',   '+234-000-0001', 'contact@sunrise-synthetic.ng',    true),
  ('dddddddd-0002-0002-0002-000000000002', 'Lagos Mainland General (Synthetic)',            '22 Herbert Macaulay Way, Yaba',    'Mainland',     'Lagos',    'Lagos Mainland', '+234-000-0002', 'contact@lmg-synthetic.ng',        true),
  ('dddddddd-0003-0003-0003-000000000003', 'Ikeja Trauma Centre (Synthetic)',               '7 Mobolaji Johnson Ave, Ikeja',    'Ikeja',        'Lagos',    'Lagos Mainland', '+234-000-0003', 'contact@ikejatrauma-synthetic.ng', true),
  ('dddddddd-0004-0004-0004-000000000004', 'Victoria Island Medical Complex (Synthetic)',   '33 Adeola Odeku Street, VI',       'Eti-Osa',      'Lagos',    'Lagos Island',   '+234-000-0004', 'contact@vimc-synthetic.ng',        true),
  ('dddddddd-0005-0005-0005-000000000005', 'Lekki Community Hospital (Synthetic)',          '11 Admiralty Way, Lekki Phase 1',  'Eti-Osa',      'Lagos',    'Lagos Island',   '+234-000-0005', 'contact@lekkicomm-synthetic.ng',   true),
  ('dddddddd-0006-0006-0006-000000000006', 'Abuja National Emergency Centre (Synthetic)',   '5 Tafawa Balewa Way, Central',     'Municipal',    'FCT',      'North Central',  '+234-000-0006', 'contact@abujaNEC-synthetic.ng',    true),
  ('dddddddd-0007-0007-0007-000000000007', 'Garki District Hospital (Synthetic)',           '18 Moshood Abiola Way, Garki II',  'Municipal',    'FCT',      'North Central',  '+234-000-0007', 'contact@garki-synthetic.ng',       true),
  ('dddddddd-0008-0008-0008-000000000008', 'Wuse Specialist Clinic (Synthetic)',            '9 Aminu Kano Crescent, Wuse II',   'Municipal',    'FCT',      'North Central',  '+234-000-0008', 'contact@wuse-synthetic.ng',        true),
  ('dddddddd-0009-0009-0009-000000000009', 'Enugu State Referral Hospital (Synthetic)',     '3 Independence Layout',            'Enugu North',  'Enugu',    'South East',     '+234-000-0009', 'contact@enugureferral-synthetic.ng',true),
  ('dddddddd-0010-0010-0010-000000000010', 'Port Harcourt Critical Care (Synthetic)',       '21 Aba Road, Rumuola',             'Obio-Akpor',   'Rivers',   'South South',    '+234-000-0010', 'contact@phcc-synthetic.ng',        true),
  ('dddddddd-0011-0011-0011-000000000011', 'Ibadan Teaching Hospital Annex (Synthetic)',    '45 Oyo Road, Ring Road',           'Ibadan North', 'Oyo',      'South West',     '+234-000-0011', 'contact@ibadantah-synthetic.ng',   true),
  ('dddddddd-0012-0012-0012-000000000012', 'Kano Central Medical Institute (Synthetic)',    '12 Murtala Muhammed Way',          'Kano Municipal','Kano',    'North West',     '+234-000-0012', 'contact@kanocentral-synthetic.ng', true);

-- ---------------------------------------------------------------------------
-- Seed Hospital Capability Profiles
-- Mix of statuses to support negative test cases (AC-04, AC-05, AC-07)
-- ---------------------------------------------------------------------------
INSERT INTO hospital_capability_profiles (
  hospital_id, availability_status, ed_operating_status,
  staff_disruption_flag, disruption_notes,
  specialties_on_duty, accepted_emergency_types,
  emergency_beds_available, icu_beds_available,
  imaging_available, blood_bank_available, ventilators_available,
  emergency_stabilization_capable, last_verified_at, outdated_threshold_hours
) VALUES
  -- confirmed, full capability (cardiac + trauma)
  ('dddddddd-0001-0001-0001-000000000001', 'confirmed', 'open', false, NULL,
   ARRAY['emergency_medicine','cardiology','surgery'],
   ARRAY['cardiac','trauma','general_medical'],
   8, 4, ARRAY['xray','ct'], true, 3, true, NOW() - INTERVAL '1 hour', 4),

  -- confirmed, cardiac specialist
  ('dddddddd-0002-0002-0002-000000000002', 'confirmed', 'open', false, NULL,
   ARRAY['emergency_medicine','cardiology'],
   ARRAY['cardiac','general_medical'],
   5, 2, ARRAY['xray'], true, 1, true, NOW() - INTERVAL '2 hours', 4),

  -- confirmed, trauma and pediatric
  ('dddddddd-0003-0003-0003-000000000003', 'confirmed', 'open', false, NULL,
   ARRAY['emergency_medicine','surgery','pediatrics'],
   ARRAY['trauma','pediatric','general_medical'],
   10, 6, ARRAY['xray','ct','mri'], true, 5, true, NOW() - INTERVAL '30 minutes', 4),

  -- unavailable (doctors on strike — mirrors the founding scenario)
  ('dddddddd-0004-0004-0004-000000000004', 'unavailable', 'closed', true,
   'Medical staff strike in progress — no emergency admissions',
   ARRAY[]::TEXT[], ARRAY[]::TEXT[],
   0, 0, ARRAY[]::TEXT[], false, 0, false, NOW() - INTERVAL '3 hours', 4),

  -- pending_confirmation
  ('dddddddd-0005-0005-0005-000000000005', 'pending_confirmation', 'limited', false, NULL,
   ARRAY['emergency_medicine'],
   ARRAY['general_medical'],
   2, 0, ARRAY['xray'], false, 0, false, NOW() - INTERVAL '5 hours', 4),

  -- outdated (last verified > 4 hours ago)
  ('dddddddd-0006-0006-0006-000000000006', 'outdated', 'open', false, NULL,
   ARRAY['emergency_medicine','surgery'],
   ARRAY['trauma','general_medical'],
   4, 2, ARRAY['xray','ct'], true, 2, true, NOW() - INTERVAL '6 hours', 4),

  -- confirmed, obstetric specialist
  ('dddddddd-0007-0007-0007-000000000007', 'confirmed', 'open', false, NULL,
   ARRAY['emergency_medicine','obstetrics'],
   ARRAY['obstetric','general_medical'],
   4, 1, ARRAY['xray'], true, 1, true, NOW() - INTERVAL '45 minutes', 4),

  -- confirmed, general
  ('dddddddd-0008-0008-0008-000000000008', 'confirmed', 'open', false, NULL,
   ARRAY['emergency_medicine'],
   ARRAY['general_medical'],
   3, 1, ARRAY['xray'], false, 0, true, NOW() - INTERVAL '1 hour', 4),

  -- unavailable
  ('dddddddd-0009-0009-0009-000000000009', 'unavailable', 'closed', false,
   'Emergency department temporarily closed for refurbishment',
   ARRAY[]::TEXT[], ARRAY[]::TEXT[],
   0, 0, ARRAY[]::TEXT[], false, 0, false, NOW() - INTERVAL '2 hours', 4),

  -- confirmed, burns and trauma
  ('dddddddd-0010-0010-0010-000000000010', 'confirmed', 'open', false, NULL,
   ARRAY['emergency_medicine','surgery','burns'],
   ARRAY['trauma','burns','general_medical'],
   6, 3, ARRAY['xray','ct'], true, 3, true, NOW() - INTERVAL '90 minutes', 4),

  -- confirmed, neurological
  ('dddddddd-0011-0011-0011-000000000011', 'confirmed', 'open', false, NULL,
   ARRAY['emergency_medicine','neurology'],
   ARRAY['neurological','general_medical'],
   5, 2, ARRAY['xray','mri'], false, 2, true, NOW() - INTERVAL '2 hours', 4),

  -- pending_confirmation
  ('dddddddd-0012-0012-0012-000000000012', 'pending_confirmation', 'limited', false, NULL,
   ARRAY['emergency_medicine'],
   ARRAY['general_medical'],
   1, 0, ARRAY['xray'], false, 0, false, NOW() - INTERVAL '3 hours', 4);

-- Seed hospital_admin users (one per hospital we need for the demo — hospitals 1 and 3)
INSERT INTO users (id, organization_id, role, name, email, hospital_id, is_active) VALUES
  (
    'cccccccc-0003-0003-0003-000000000001',
    'aaaaaaaa-0001-0001-0001-000000000001',  -- org scoping: admin associated with Org A for demo
    'hospital_admin',
    'Dr. Ngozi Eze (Synthetic)',
    'ngozi.admin@sunrise-synthetic.ng',
    'dddddddd-0001-0001-0001-000000000001',
    true
  ),
  (
    'cccccccc-0003-0003-0003-000000000002',
    'aaaaaaaa-0001-0001-0001-000000000001',
    'hospital_admin',
    'Dr. Seun Adebayo (Synthetic)',
    'seun.admin@ikejatrauma-synthetic.ng',
    'dddddddd-0003-0003-0003-000000000003',
    true
  );

-- ---------------------------------------------------------------------------
-- Seed Synthetic Ambulance Units
-- ---------------------------------------------------------------------------
INSERT INTO ambulance_units (id, organization_id, unit_name, status, is_synthetic) VALUES
  ('eeeeeeee-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000001', 'RR-AMB-01 (Synthetic)', 'available',  true),
  ('eeeeeeee-0001-0001-0001-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001', 'RR-AMB-02 (Synthetic)', 'available',  true),
  ('eeeeeeee-0001-0001-0001-000000000003', 'aaaaaaaa-0001-0001-0001-000000000001', 'RR-AMB-03 (Synthetic)', 'unavailable',true),
  ('eeeeeeee-0002-0002-0002-000000000001', 'bbbbbbbb-0002-0002-0002-000000000002', 'L112-AMB-01 (Synthetic)','available', true),
  ('eeeeeeee-0002-0002-0002-000000000002', 'bbbbbbbb-0002-0002-0002-000000000002', 'L112-AMB-02 (Synthetic)','available', true);
