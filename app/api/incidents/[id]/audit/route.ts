/**
 * GET /api/incidents/[id]/audit
 * Returns the complete, immutable audit log for an incident.
 * Auth: response_agent, ambulance_dispatcher, org_admin
 * Architecture v1.7 §10, PRD F9, MVP AC-14, AC-15
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/middleware";

type Params = { params: { id: string } };

export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireRole(request, [
    "response_agent", "ambulance_dispatcher", "org_admin",
  ]);
  if (auth.error) return auth.error;

  // Confirm incident belongs to agent's org
  const { data: incident } = await supabaseServer
    .from("incidents")
    .select("id, organization_id")
    .eq("id", params.id)
    .eq("organization_id", auth.organizationId)
    .single();

  if (!incident) {
    return NextResponse.json({ error: "INCIDENT_NOT_FOUND" }, { status: 404 });
  }

  const { data: entries, error } = await supabaseServer
    .from("audit_log_entries")
    .select(
      "id, action_type, source, actor_id, actor_role, entity_type, entity_id, detail, created_at"
    )
    .eq("incident_id", params.id)
    .eq("organization_id", auth.organizationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[GET audit]", error.message);
    return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ audit_entries: entries });
}
