/**
 * GET /api/hospitals — Search hospital registry
 *
 * Auth: response_agent, ambulance_dispatcher, org_admin, hospital_admin
 * Returns all hospitals with their capability profiles.
 * Filtering: ?availability_status=confirmed&emergency_type=cardiac&lga=Ikeja
 * Architecture v1.7 §4, §5
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/middleware";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, [
    "response_agent", "ambulance_dispatcher", "org_admin", "hospital_admin",
  ]);
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const availabilityStatus = searchParams.get("availability_status");
  const emergencyType = searchParams.get("emergency_type");
  const lga = searchParams.get("lga");

  let query = supabaseServer
    .from("hospitals")
    .select(`
      id, name, address, lga, state, geographic_zone, is_synthetic,
      hospital_capability_profiles (
        availability_status, ed_operating_status,
        staff_disruption_flag, disruption_notes,
        specialties_on_duty, accepted_emergency_types,
        emergency_beds_available, icu_beds_available,
        imaging_available, blood_bank_available, ventilators_available,
        emergency_stabilization_capable,
        last_verified_at, outdated_threshold_hours, updated_at
      )
    `);

  if (lga) query = query.ilike("lga", `%${lga}%`);

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/hospitals]", error.message);
    return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
  }

  // Apply post-query filters (availability_status, emergency_type)
  // These operate on the joined capability profile — cannot be done in a
  // simple Supabase query filter on a one-to-one join without a view.
  let hospitals = data ?? [];

  if (availabilityStatus) {
    hospitals = hospitals.filter((h) => {
      const profile = Array.isArray(h.hospital_capability_profiles)
        ? h.hospital_capability_profiles[0]
        : h.hospital_capability_profiles;
      return profile?.availability_status === availabilityStatus;
    });
  }

  if (emergencyType) {
    hospitals = hospitals.filter((h) => {
      const profile = Array.isArray(h.hospital_capability_profiles)
        ? h.hospital_capability_profiles[0]
        : h.hospital_capability_profiles;
      return profile?.accepted_emergency_types?.includes(emergencyType);
    });
  }

  return NextResponse.json({ hospitals });
}
