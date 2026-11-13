/**
 * GET  /api/incidents/[id] — Incident detail (org-scoped)
 * PATCH /api/incidents/[id] — Update status or agent notes
 *
 * Auth: response_agent, ambulance_dispatcher, org_admin
 * Architecture v1.7 §4
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/middleware";

type Params = { params: { id: string } };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireRole(request, ["response_agent", "ambulance_dispatcher", "org_admin"]);
  if (auth.error) return auth.error;

  const { data, error } = await supabaseServer
    .from("incidents")
    .select("*")
    .eq("id", params.id)
    .eq("organization_id", auth.organizationId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ incident: data });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const auth = await requireRole(request, ["response_agent", "ambulance_dispatcher"]);
  if (auth.error) return auth.error;

  let body: { status?: string; triage_priority?: string; assigned_agent_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const allowedStatuses = [
    "new", "in_progress", "hospital_selected", "hospital_confirmed",
    "acceptance_confirmed", "dispatched", "en_route", "arrived", "alert_issued", "closed",
  ];

  if (body.status && !allowedStatuses.includes(body.status)) {
    return NextResponse.json({ error: "INVALID_STATUS", message: `Unknown status: ${body.status}` }, { status: 400 });
  }

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.status) updatePayload.status = body.status;
  if (body.triage_priority) updatePayload.triage_priority = body.triage_priority;
  if (body.assigned_agent_id) updatePayload.assigned_agent_id = body.assigned_agent_id;

  const { data, error } = await supabaseServer
    .from("incidents")
    .update(updatePayload)
    .eq("id", params.id)
    .eq("organization_id", auth.organizationId)
    .select("id, status, triage_priority, assigned_agent_id, updated_at")
    .single();

  if (error || !data) {
    console.error("[PATCH /api/incidents/[id]]", error?.message);
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  // Audit: status change
  if (body.status) {
    await supabaseServer.rpc("write_with_audit", {
      p_operation_data: { new_status: body.status },
      p_audit_source:   "human",
      p_action_type:    "incident_status_changed",
      p_entity_type:    "incident",
      p_entity_id:      params.id,
      p_incident_id:    params.id,
      p_org_id:         auth.organizationId,
    });
  }

  return NextResponse.json({ incident: data });
}
