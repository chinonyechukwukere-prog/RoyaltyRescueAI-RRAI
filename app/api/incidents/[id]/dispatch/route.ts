/**
 * POST /api/incidents/[id]/dispatch  — Assign ambulance unit (agent/dispatcher)
 * PATCH /api/incidents/[id]/dispatch — Advance ambulance status (en_route → arrived)
 *
 * Architecture v1.7 §9.5, PRD F7, MVP AC-09, AC-10, AC-11
 *
 * Safety rules enforced:
 * - Dispatch requires a valid, operationally_valid acceptance record (AC-09).
 * - Hospital availability is re-checked at dispatch time — not only at acceptance (AC-10).
 * - Ambulance unit must belong to the agent's organization and be 'available'.
 * - No autonomous dispatch, cancellation, or redirection (Architecture v1.7 §9).
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/middleware";

type Params = { params: { id: string } };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireRole(request, ["response_agent", "ambulance_dispatcher"]);
  if (auth.error) return auth.error;

  const incidentId = params.id;

  let body: { ambulance_unit_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.ambulance_unit_id) {
    return NextResponse.json({ error: "ambulance_unit_id is required." }, { status: 400 });
  }

  // Load incident
  const { data: incident } = await supabaseServer
    .from("incidents")
    .select("id, status, selected_hospital_id, organization_id")
    .eq("id", incidentId)
    .eq("organization_id", auth.organizationId)
    .single();

  if (!incident) {
    return NextResponse.json({ error: "INCIDENT_NOT_FOUND" }, { status: 404 });
  }

  // Must be acceptance_confirmed
  if (incident.status !== "acceptance_confirmed") {
    return NextResponse.json(
      { error: "DISPATCH_BLOCKED", message: `Dispatch requires acceptance_confirmed status. Current status: '${incident.status}'.` },
      { status: 409 }
    );
  }

  // AC-09: active acceptance record must exist
  const { data: acceptance } = await supabaseServer
    .from("patient_acceptance_records")
    .select("id, operationally_valid")
    .eq("incident_id", incidentId)
    .eq("operationally_valid", true)
    .single();

  if (!acceptance) {
    return NextResponse.json(
      { error: "DISPATCH_BLOCKED", message: "No valid patient acceptance record found. Patient acceptance must be confirmed before dispatch." },
      { status: 409 }
    );
  }

  // AC-10: re-check hospital availability at dispatch time
  if (incident.selected_hospital_id) {
    const { data: profile } = await supabaseServer
      .from("hospital_capability_profiles")
      .select("availability_status, last_verified_at, outdated_threshold_hours")
      .eq("hospital_id", incident.selected_hospital_id)
      .single();

    if (!profile || profile.availability_status !== "confirmed") {
      // Invalidate acceptance record and block dispatch (D3 safety control)
      await supabaseServer.rpc("invalidate_acceptance_record", {
        p_incident_id: incidentId,
        p_reason: `Hospital availability changed to '${profile?.availability_status ?? "unknown"}' at dispatch time.`,
      });

      await supabaseServer
        .from("incidents")
        .update({ status: "alert_issued", updated_at: new Date().toISOString() })
        .eq("id", incidentId);

      await supabaseServer.rpc("write_with_audit", {
        p_operation_data: { hospital_id: incident.selected_hospital_id, availability_status: profile?.availability_status },
        p_audit_source:   "system",
        p_action_type:    "dispatch_blocked_status_change",
        p_entity_type:    "incident",
        p_entity_id:      incidentId,
        p_incident_id:    incidentId,
        p_org_id:         auth.organizationId,
      });

      return NextResponse.json(
        {
          error: "DISPATCH_BLOCKED",
          message: `Hospital availability has changed to '${profile?.availability_status}'. Dispatch blocked. Patient acceptance has been voided. Human review required.`,
          new_incident_status: "alert_issued",
        },
        { status: 409 }
      );
    }

    // Also block if outdated
    if (profile.last_verified_at) {
      const thresholdMs = (profile.outdated_threshold_hours ?? 4) * 60 * 60 * 1000;
      if (Date.now() - new Date(profile.last_verified_at).getTime() > thresholdMs) {
        return NextResponse.json(
          { error: "DISPATCH_BLOCKED", message: "Hospital verification has expired. Re-verification required before dispatch." },
          { status: 409 }
        );
      }
    }
  }

  // Ambulance unit must belong to org and be available
  const { data: unit } = await supabaseServer
    .from("ambulance_units")
    .select("id, unit_name, status")
    .eq("id", body.ambulance_unit_id)
    .eq("organization_id", auth.organizationId)
    .single();

  if (!unit) {
    return NextResponse.json({ error: "UNIT_NOT_FOUND" }, { status: 404 });
  }
  if (unit.status !== "available") {
    return NextResponse.json(
      { error: "UNIT_UNAVAILABLE", message: `Ambulance unit '${unit.unit_name}' is currently '${unit.status}'.` },
      { status: 409 }
    );
  }

  // Create dispatch assignment
  const { data: dispatch, error: dispatchErr } = await supabaseServer
    .from("dispatch_assignments")
    .insert({
      incident_id:          incidentId,
      ambulance_unit_id:    body.ambulance_unit_id,
      assigned_by_user_id:  auth.userId,
      status:               "dispatched",
    })
    .select("id, assigned_at, status")
    .single();

  if (dispatchErr || !dispatch) {
    console.error("[POST dispatch]", dispatchErr?.message);
    return NextResponse.json({ error: "DISPATCH_FAILED" }, { status: 500 });
  }

  // Update ambulance unit to dispatched
  await supabaseServer
    .from("ambulance_units")
    .update({ status: "dispatched" })
    .eq("id", body.ambulance_unit_id);

  // Advance incident to dispatched
  await supabaseServer
    .from("incidents")
    .update({ status: "dispatched", updated_at: new Date().toISOString() })
    .eq("id", incidentId);

  // Audit
  await supabaseServer.rpc("write_with_audit", {
    p_operation_data: { ambulance_unit_id: body.ambulance_unit_id, unit_name: unit.unit_name },
    p_audit_source:   "human",
    p_action_type:    "dispatch_assigned",
    p_entity_type:    "dispatch_assignment",
    p_entity_id:      dispatch.id,
    p_incident_id:    incidentId,
    p_org_id:         auth.organizationId,
  });

  return NextResponse.json({ dispatch }, { status: 201 });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireRole(request, ["response_agent", "ambulance_dispatcher"]);
  if (auth.error) return auth.error;

  let body: { status: "en_route" | "arrived" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!["en_route", "arrived"].includes(body.status)) {
    return NextResponse.json({ error: "status must be 'en_route' or 'arrived'." }, { status: 400 });
  }

  // Find active dispatch for this incident
  const { data: dispatch } = await supabaseServer
    .from("dispatch_assignments")
    .select("id, ambulance_unit_id, incident_id")
    .eq("incident_id", params.id)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .single();

  if (!dispatch) {
    return NextResponse.json({ error: "NO_DISPATCH_FOUND" }, { status: 404 });
  }

  await supabaseServer
    .from("dispatch_assignments")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", dispatch.id);

  await supabaseServer
    .from("incidents")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("organization_id", auth.organizationId);

  // Audit
  const { data: incident } = await supabaseServer.from("incidents").select("organization_id").eq("id", params.id).single();
  await supabaseServer.rpc("write_with_audit", {
    p_operation_data: { new_status: body.status },
    p_audit_source:   "human",
    p_action_type:    "dispatch_status_changed",
    p_entity_type:    "dispatch_assignment",
    p_entity_id:      dispatch.id,
    p_incident_id:    params.id,
    p_org_id:         incident?.organization_id ?? auth.organizationId,
  });

  return NextResponse.json({ status: body.status });
}

/** GET — return available ambulance units for org */
export async function GET(request: NextRequest, { params: _ }: Params) {
  const auth = await requireRole(request, ["response_agent", "ambulance_dispatcher", "org_admin"]);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseServer
    .from("ambulance_units")
    .select("id, unit_name, status, is_synthetic")
    .eq("organization_id", auth.organizationId)
    .order("unit_name");

  if (error) return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
  return NextResponse.json({ units: data });
}
