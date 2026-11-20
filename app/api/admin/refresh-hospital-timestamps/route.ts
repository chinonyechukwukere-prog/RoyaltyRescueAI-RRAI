/**
 * POST /api/admin/refresh-hospital-timestamps
 *
 * Prototype maintenance utility — refreshes last_verified_at to NOW() for all
 * hospital capability profiles whose availability_status is 'confirmed'.
 *
 * PURPOSE: The seed data records last_verified_at as a fixed timestamp
 * (NOW() at migration time). After the outdated_threshold_hours window passes,
 * all confirmed hospitals become ineligible for copilot recommendations.
 * This endpoint resets those timestamps so the full AC-09/10/11 workflow
 * remains testable across multiple test runs without re-running migrations.
 *
 * SAFETY: Only 'confirmed' hospitals are touched. Unavailable, pending_confirmation,
 * and outdated records are not modified — their exclusion from recommendations
 * remains intact for negative-path testing (AC-04, AC-05, AC-07).
 *
 * Auth: org_admin only (not accessible to response_agent or hospital_admin roles)
 * Architecture v1.7 §13 — synthetic data maintenance
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/middleware";

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["org_admin"]);
  if (auth.error) return auth.error;

  // Update last_verified_at to NOW() only for confirmed hospitals.
  // This does not change availability_status or any clinical fields.
  const { data, error } = await supabaseServer
    .from("hospital_capability_profiles")
    .update({ last_verified_at: new Date().toISOString() })
    .eq("availability_status", "confirmed")
    .select("hospital_id");

  if (error) {
    console.error("[POST /api/admin/refresh-hospital-timestamps]", error.message);
    return NextResponse.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  const count = data?.length ?? 0;

  // Audit the refresh action using the approved 'hospital_status_changed' type,
  // which is the closest match in the registry for a capability profile update.
  // p_incident_id is omitted (defaults to NULL) — no incident context here.
  await supabaseServer.rpc("write_with_audit", {
    p_operation_data: { action: "last_verified_at_refreshed", refreshed_count: count },
    p_audit_source:   "human",
    p_action_type:    "hospital_status_changed",
    p_entity_type:    "hospital_capability_profile",
    p_entity_id:      auth.userId,
    p_org_id:         auth.organizationId,
  });

  return NextResponse.json({
    refreshed_count: count,
    message: `last_verified_at refreshed to NOW() on ${count} confirmed hospital profile(s).`,
  });
}
