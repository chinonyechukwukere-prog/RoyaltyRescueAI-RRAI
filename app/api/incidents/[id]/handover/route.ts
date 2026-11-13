/**
 * POST /api/incidents/[id]/handover  — Generate clinical handover summary (agent)
 * PATCH /api/incidents/[id]/handover — Acknowledge handover (hospital_admin)
 * GET  /api/incidents/[id]/handover  — Retrieve handover summary
 *
 * Architecture v1.7, PRD F8, MVP AC-12, AC-13
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/middleware";

type Params = { params: { id: string } };

export async function POST(request: NextRequest, { params }: Params) {
  const auth = await requireRole(request, ["response_agent"]);
  if (auth.error) return auth.error;

  const incidentId = params.id;

  // Load incident
  const { data: incident } = await supabaseServer
    .from("incidents")
    .select("id, status, caller_name, presenting_complaint, triage_priority, selected_hospital_id, organization_id")
    .eq("id", incidentId)
    .eq("organization_id", auth.organizationId)
    .single();

  if (!incident) return NextResponse.json({ error: "INCIDENT_NOT_FOUND" }, { status: 404 });

  // Must be dispatched or later
  const dispatchedStatuses = ["dispatched", "en_route", "arrived"];
  if (!dispatchedStatuses.includes(incident.status)) {
    return NextResponse.json(
      { error: "HANDOVER_NOT_READY", message: `Handover can only be generated after dispatch. Current status: '${incident.status}'.` },
      { status: 409 }
    );
  }

  // Get active dispatch (ambulance unit)
  const { data: dispatch } = await supabaseServer
    .from("dispatch_assignments")
    .select("id, ambulance_unit_id, status")
    .eq("incident_id", incidentId)
    .order("assigned_at", { ascending: false })
    .limit(1)
    .single();

  let body: { agent_notes?: string } = {};
  try { body = await request.json(); } catch { /* notes optional */ }

  const { data: handover, error: insertErr } = await supabaseServer
    .from("handover_summaries")
    .insert({
      incident_id:          incidentId,
      hospital_id:          incident.selected_hospital_id,
      generated_by_user_id: auth.userId,
      patient_name:         incident.caller_name,   // synthetic — matches seed data pattern
      presenting_complaint: incident.presenting_complaint,
      triage_priority:      incident.triage_priority,
      ambulance_unit_id:    dispatch?.ambulance_unit_id ?? null,
      dispatch_status:      dispatch?.status ?? null,
      agent_notes:          body.agent_notes ?? null,
    })
    .select("id, generated_at")
    .single();

  if (insertErr || !handover) {
    console.error("[POST handover]", insertErr?.message);
    return NextResponse.json({ error: "INSERT_FAILED" }, { status: 500 });
  }

  // Audit
  await supabaseServer.rpc("write_with_audit", {
    p_operation_data: { hospital_id: incident.selected_hospital_id },
    p_audit_source:   "human",
    p_action_type:    "handover_generated",
    p_entity_type:    "handover_summary",
    p_entity_id:      handover.id,
    p_incident_id:    incidentId,
    p_org_id:         incident.organization_id,
  });

  return NextResponse.json({ handover }, { status: 201 });
}

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireRole(request, [
    "response_agent", "ambulance_dispatcher", "hospital_admin", "org_admin",
  ]);
  if (auth.error) return auth.error;

  // For hospital_admin: scope to their hospital
  let query = supabaseServer
    .from("handover_summaries")
    .select("*")
    .eq("incident_id", params.id)
    .order("generated_at", { ascending: false });

  if (auth.role === "hospital_admin" && auth.hospitalId) {
    query = query.eq("hospital_id", auth.hospitalId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
  return NextResponse.json({ handovers: data });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireRole(request, ["hospital_admin"]);
  if (auth.error) return auth.error;

  // Find latest unacknowledged handover for this incident + hospital
  const { data: handover } = await supabaseServer
    .from("handover_summaries")
    .select("id, hospital_id, incident_id")
    .eq("incident_id", params.id)
    .eq("hospital_id", auth.hospitalId)
    .is("acknowledged_at", null)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  if (!handover) {
    return NextResponse.json({ error: "NO_PENDING_HANDOVER" }, { status: 404 });
  }

  await supabaseServer
    .from("handover_summaries")
    .update({
      acknowledged_by_user_id: auth.userId,
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", handover.id);

  // Determine org for audit
  const { data: incident } = await supabaseServer.from("incidents").select("organization_id").eq("id", params.id).single();

  await supabaseServer.rpc("write_with_audit", {
    p_operation_data: { acknowledged_by: auth.userId },
    p_audit_source:   "human",
    p_action_type:    "handover_acknowledged",
    p_entity_type:    "handover_summary",
    p_entity_id:      handover.id,
    p_incident_id:    params.id,
    p_org_id:         incident?.organization_id ?? auth.organizationId,
  });

  return NextResponse.json({ acknowledged: true });
}
