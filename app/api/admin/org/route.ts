/**
 * GET /api/admin/org — Organisation profile and user roster (read-only)
 * F10: Organisation Administration Panel
 *
 * Auth: org_admin only
 * Scope: returns data for the caller's organization_id only (D4 — strict org isolation)
 * Architecture v1.7 §7.4, PRD F10
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/middleware";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["org_admin"]);
  if (auth.error) return auth.error;

  const { organizationId } = auth;

  // Organisation profile
  const { data: org, error: orgErr } = await supabaseServer
    .from("organizations")
    .select("id, name, type, status, created_at")
    .eq("id", organizationId)
    .single();

  if (orgErr || !org) {
    return NextResponse.json({ error: "ORGANIZATION_NOT_FOUND" }, { status: 404 });
  }

  // User roster — same org only
  const { data: users, error: usersErr } = await supabaseServer
    .from("users")
    .select("id, name, email, role, hospital_id, is_active")
    .eq("organization_id", organizationId)
    .order("role")
    .order("name");

  if (usersErr) {
    console.error("[GET /api/admin/org] users error:", usersErr.message);
    return NextResponse.json({ error: "USERS_FETCH_FAILED" }, { status: 500 });
  }

  // Incident counts by status (summary stats)
  const { data: incidentStats } = await supabaseServer
    .from("incidents")
    .select("status")
    .eq("organization_id", organizationId);

  const statusCounts: Record<string, number> = {};
  for (const row of incidentStats ?? []) {
    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;
  }

  return NextResponse.json({
    organization: org,
    users: users ?? [],
    incident_summary: statusCounts,
  });
}
