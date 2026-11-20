/**
 * POST /api/incidents/[id]/acceptance
 * Patient acceptance by hospital_admin — blocking gate before dispatch.
 * Architecture v1.7 §9, PRD F6, MVP AC-08, AC-09
 *
 * Safety rules enforced here:
 * 1. Only hospital_admin role may accept.
 * 2. The hospital being accepted must match the incident's selected_hospital_id.
 * 3. The hospital's capability profile must currently be 'confirmed'.
 * 4. No duplicate active acceptance records for the same incident.
 * 5. Incident must be in 'hospital_selected' or 'hospital_confirmed' state.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/middleware";

type Params = { params: { id: string } };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireRole(request, ["hospital_admin"]);
  if (auth.error) return auth.error;

  const incidentId = params.id;

  // Load incident — must exist (any org; hospital admin is cross-org for acceptance)
  const { data: incident, error: incidentErr } = await supabaseServer
    .from("incidents")
    .select("id, status, selected_hospital_id, organization_id")
    .eq("id", incidentId)
    .single();

  if (incidentErr || !incident) {
    return NextResponse.json({ error: "INCIDENT_NOT_FOUND" }, { status: 404 });
  }

  // Incident must have a hospital selected
  if (!incident.selected_hospital_id) {
    return NextResponse.json(
      { error: "NO_HOSPITAL_SELECTED", message: "No hospital has been selected for this incident yet." },
      { status: 409 }
    );
  }

  // Accepting admin must be for the selected hospital
  if (auth.hospitalId !== incident.selected_hospital_id) {
    return NextResponse.json(
      { error: "FORBIDDEN", message: "You may only accept patients for your own hospital." },
      { status: 403 }
    );
  }

  // Incident must be in an acceptable state
  const acceptableStatuses = ["hospital_selected", "hospital_confirmed"];
  if (!acceptableStatuses.includes(incident.status)) {
    return NextResponse.json(
      { error: "INVALID_STATUS", message: `Acceptance is not permitted when incident is '${incident.status}'.` },
      { status: 409 }
    );
  }

  // Hospital must have confirmed availability right now (not at time of selection)
  const { data: profile } = await supabaseServer
    .from("hospital_capability_profiles")
    .select("availability_status")
    .eq("hospital_id", incident.selected_hospital_id)
    .single();

  if (!profile || profile.availability_status !== "confirmed") {
    return NextResponse.json(
      {
        error: "HOSPITAL_NOT_AVAILABLE",
        message: `Hospital availability is '${profile?.availability_status ?? "unknown"}'. Only hospitals with confirmed status can accept patients.`,
      },
      { status: 409 }
    );
  }

  // No existing active acceptance for this incident
  const { data: existing } = await supabaseServer
    .from("patient_acceptance_records")
    .select("id")
    .eq("incident_id", incidentId)
    .eq("operationally_valid", true)
    .single();

  if (existing) {
    return NextResponse.json(
      { error: "ALREADY_ACCEPTED", message: "An active patient acceptance record already exists for this incident." },
      { status: 409 }
    );
  }

  let body: { notes?: string } = {};
  try { body = await request.json(); } catch { /* notes are optional */ }

  // Insert acceptance record
  const { data: record, error: insertErr } = await supabaseServer
    .from("patient_acceptance_records")
    .insert({
      incident_id:         incidentId,
      hospital_id:         incident.selected_hospital_id,
      accepted_by_user_id: auth.userId,
      notes:               body.notes ?? null,
      operationally_valid: true,
    })
    .select("id, accepted_at, operationally_valid")
    .single();

  if (insertErr || !record) {
    console.error("[POST acceptance]", insertErr?.message);
    return NextResponse.json({ error: "INSERT_FAILED" }, { status: 500 });
  }

  // Advance incident to acceptance_confirmed
  await supabaseServer
    .from("incidents")
    .update({ status: "acceptance_confirmed", updated_at: new Date().toISOString() })
    .eq("id", incidentId);

  // Audit
  await supabaseServer.rpc("write_with_audit", {
    p_operation_data: { hospital_id: incident.selected_hospital_id, accepted_by: auth.userId },
    p_audit_source:   "human",
    p_action_type:    "patient_acceptance_submitted",
    p_entity_type:    "patient_acceptance_record",
    p_entity_id:      record.id,
    p_incident_id:    incidentId,
    p_org_id:         incident.organization_id,
  });

  return NextResponse.json({ acceptance: record }, { status: 201 });
}

/**
 * GET /api/incidents/[id]/acceptance
 * Returns the current active acceptance record for an incident.
 * Auth: response_agent, ambulance_dispatcher, hospital_admin, org_admin
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireRole(request, [
    "response_agent", "ambulance_dispatcher", "hospital_admin", "org_admin",
  ]);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseServer
    .from("patient_acceptance_records")
    .select("id, hospital_id, accepted_by_user_id, accepted_at, notes, operationally_valid, invalidated_at, invalidated_reason")
    .eq("incident_id", params.id)
    .order("accepted_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ acceptance_records: data });
}
