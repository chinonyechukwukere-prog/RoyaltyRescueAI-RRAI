/**
 * GET /api/hospitals/[id] — Hospital detail with capability profile
 * PUT /api/hospitals/[id]/availability — Hospital admin updates availability status
 *
 * Auth:
 *   GET: any authenticated role
 *   PUT: hospital_admin only, scoped to their hospital_id JWT claim
 * Architecture v1.7 §4, §5
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/supabase/middleware";

type Params = { params: { id: string } };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseServer
    .from("hospitals")
    .select(`
      id, name, address, lga, state, geographic_zone, phone, email, is_synthetic,
      hospital_capability_profiles (*)
    `)
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ hospital: data });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const auth = await requireRole(request, ["hospital_admin"]);
  if (auth.error) return auth.error;

  // Hospital admin can only update their own hospital
  if (auth.hospitalId !== params.id) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "You may only update availability for your own hospital." },
      { status: 403 }
    );
  }

  let body: {
    availability_status?: string;
    ed_operating_status?: string;
    staff_disruption_flag?: boolean;
    disruption_notes?: string;
    emergency_beds_available?: number;
    icu_beds_available?: number;
    specialties_on_duty?: string[];
    accepted_emergency_types?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const allowedStatuses = ["confirmed", "unavailable", "pending_confirmation", "outdated"];
  if (body.availability_status && !allowedStatuses.includes(body.availability_status)) {
    return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
  }

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    last_verified_at: new Date().toISOString(),
    verified_by_user_id: auth.userId,
  };

  if (body.availability_status !== undefined) updatePayload.availability_status = body.availability_status;
  if (body.ed_operating_status !== undefined) updatePayload.ed_operating_status = body.ed_operating_status;
  if (body.staff_disruption_flag !== undefined) updatePayload.staff_disruption_flag = body.staff_disruption_flag;
  if (body.disruption_notes !== undefined) updatePayload.disruption_notes = body.disruption_notes;
  if (body.emergency_beds_available !== undefined) updatePayload.emergency_beds_available = body.emergency_beds_available;
  if (body.icu_beds_available !== undefined) updatePayload.icu_beds_available = body.icu_beds_available;
  if (body.specialties_on_duty !== undefined) updatePayload.specialties_on_duty = body.specialties_on_duty;
  if (body.accepted_emergency_types !== undefined) updatePayload.accepted_emergency_types = body.accepted_emergency_types;

  const { data, error } = await supabaseServer
    .from("hospital_capability_profiles")
    .update(updatePayload)
    .eq("hospital_id", params.id)
    .select("availability_status, ed_operating_status, staff_disruption_flag, last_verified_at, updated_at")
    .single();

  if (error || !data) {
    console.error("[PUT /api/hospitals/[id]]", error?.message);
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  // Audit
  await supabaseServer.rpc("write_with_audit", {
    p_operation_data: { hospital_id: params.id, new_status: body.availability_status },
    p_audit_source:   "human",
    p_action_type:    "hospital_status_changed",
    p_entity_type:    "hospital",
    p_entity_id:      params.id,
    p_incident_id:    null,
    p_org_id:         auth.organizationId,
  });

  return NextResponse.json({ profile: data });
}
