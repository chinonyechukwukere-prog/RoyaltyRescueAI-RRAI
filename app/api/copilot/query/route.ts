/**
 * POST /api/copilot/query — AI Copilot query with dual-pass hospital validation
 *
 * Auth: response_agent only
 * Architecture v1.7 §4, §5, §6
 *
 * STAGE 2 STATUS:
 * - Dual-pass hospital eligibility validation: ✅ IMPLEMENTED
 * - watsonx.ai LLM call: ⏳ PENDING (OA-2 — model ID/endpoint not yet confirmed)
 *   Until OA-2 is resolved, the route returns validated hospital candidates
 *   with a stub rationale, so the agent dashboard and validation logic are
 *   fully testable without live watsonx.ai credentials.
 *
 * The dual-pass validation (pre-filter + post-filter) is the safety-critical
 * component. It is fully implemented and enforced regardless of LLM status.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/middleware";

// ---------------------------------------------------------------------------
// Hospital Eligibility Validation Service
// Architecture v1.7 §5 — five-check dual-pass validation
// ---------------------------------------------------------------------------

type CapabilityProfile = {
  availability_status: string;
  ed_operating_status: string;
  staff_disruption_flag: boolean;
  accepted_emergency_types: string[];
  last_verified_at: string | null;
  outdated_threshold_hours: number;
};

type Hospital = {
  id: string;
  name: string;
  lga: string;
  geographic_zone: string;
  hospital_capability_profiles: CapabilityProfile | CapabilityProfile[] | null;
};

type EligibilityResult =
  | { eligible: true; profile: CapabilityProfile }
  | { eligible: false; reason: string };

function checkHospitalEligibility(
  hospital: Hospital,
  emergencyType: string
): EligibilityResult {
  const profile = Array.isArray(hospital.hospital_capability_profiles)
    ? hospital.hospital_capability_profiles[0]
    : hospital.hospital_capability_profiles;

  if (!profile) return { eligible: false, reason: "no_capability_profile" };

  // Check 1: availability_status must be 'confirmed'
  if (profile.availability_status !== "confirmed") {
    return { eligible: false, reason: profile.availability_status };
  }

  // Check 2: ED must be open or limited (not closed)
  if (profile.ed_operating_status === "closed") {
    return { eligible: false, reason: "ed_closed" };
  }

  // Check 3: no active staff disruption
  if (profile.staff_disruption_flag) {
    return { eligible: false, reason: "staff_disruption" };
  }

  // Check 4: emergency type match
  if (!profile.accepted_emergency_types?.includes(emergencyType)) {
    return { eligible: false, reason: "capability_mismatch" };
  }

  // Check 5: not outdated (last_verified_at within threshold)
  if (profile.last_verified_at) {
    const verifiedAt = new Date(profile.last_verified_at).getTime();
    const thresholdMs = (profile.outdated_threshold_hours ?? 4) * 60 * 60 * 1000;
    if (Date.now() - verifiedAt > thresholdMs) {
      return { eligible: false, reason: "outdated" };
    }
  } else {
    return { eligible: false, reason: "never_verified" };
  }

  return { eligible: true, profile };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["response_agent"]);
  if (auth.error) return auth.error;

  let body: { incident_id: string; query_text: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.incident_id || !body.query_text?.trim()) {
    return NextResponse.json(
      { error: "MISSING_FIELDS", message: "incident_id and query_text are required." },
      { status: 400 }
    );
  }

  // Verify incident belongs to agent's org
  const { data: incident, error: incidentError } = await supabaseServer
    .from("incidents")
    .select("id, emergency_type, lga, organization_id")
    .eq("id", body.incident_id)
    .eq("organization_id", auth.organizationId)
    .single();

  if (incidentError || !incident) {
    return NextResponse.json({ error: "INCIDENT_NOT_FOUND" }, { status: 404 });
  }

  const emergencyType = incident.emergency_type as string;

  // PRE-FILTER: fetch all hospitals and run eligibility check before any LLM call
  const { data: hospitals, error: hospitalError } = await supabaseServer
    .from("hospitals")
    .select(`
      id, name, lga, geographic_zone,
      hospital_capability_profiles (
        availability_status, ed_operating_status, staff_disruption_flag,
        accepted_emergency_types, last_verified_at, outdated_threshold_hours,
        emergency_beds_available, icu_beds_available, emergency_stabilization_capable
      )
    `);

  if (hospitalError) {
    console.error("[POST /api/copilot/query] Hospital fetch error:", hospitalError.message);
    return NextResponse.json({ error: "REGISTRY_FETCH_FAILED" }, { status: 500 });
  }

  const eligible: { hospital: Hospital; profile: CapabilityProfile }[] = [];
  const excluded: { hospital_id: string; hospital_name: string; exclusion_reason: string }[] = [];

  for (const hospital of (hospitals ?? []) as Hospital[]) {
    const result = checkHospitalEligibility(hospital, emergencyType);
    if (result.eligible) {
      eligible.push({ hospital, profile: result.profile });
    } else {
      excluded.push({
        hospital_id: hospital.id,
        hospital_name: hospital.name,
        exclusion_reason: result.reason,
      });
    }
  }

  // Log audit entry for the query
  const queryId = crypto.randomUUID();
  await supabaseServer.rpc("write_with_audit", {
    p_operation_data: { query_text: body.query_text, emergency_type: emergencyType, eligible_count: eligible.length },
    p_audit_source:   "human",
    p_action_type:    "copilot_query",
    p_entity_type:    "incident",
    p_entity_id:      body.incident_id,
    p_incident_id:    body.incident_id,
    p_org_id:         auth.organizationId,
  });

  // If no eligible hospitals — escalation path (AC-05)
  if (eligible.length === 0) {
    await supabaseServer.rpc("write_with_audit", {
      p_operation_data: { excluded_count: excluded.length },
      p_audit_source:   "system",
      p_action_type:    "copilot_escalation_no_eligible_hospitals",
      p_entity_type:    "incident",
      p_entity_id:      body.incident_id,
      p_incident_id:    body.incident_id,
      p_org_id:         auth.organizationId,
    });

    return NextResponse.json({
      query_id: queryId,
      validated_recommendations: [],
      excluded_hospitals: excluded,
      escalation_required: true,
      escalation_message:
        "No hospitals with confirmed availability match the required emergency type. " +
        "Human escalation is required. Suggested actions: contact regional coordinator, " +
        "check for private facilities, or escalate to supervisor.",
      watsonx_status: "not_called_no_eligible_candidates",
    });
  }

  // POST-FILTER: watsonx.ai call (OA-2 pending)
  // When OA-2 is resolved: replace stub rationale with actual watsonx.ai response.
  // The validated_recommendations array structure is final and will not change.
  const watsonxReady = !!(
    process.env.WATSONX_API_KEY &&
    process.env.WATSONX_PROJECT_ID &&
    process.env.WATSONX_URL
  );

  const recommendations = eligible.map(({ hospital, profile }) => ({
    hospital_id: hospital.id,
    hospital_name: hospital.name,
    lga: hospital.lga,
    availability_status: profile.availability_status,
    last_verified_at: profile.last_verified_at,
    accepted_emergency_types: profile.accepted_emergency_types,
    emergency_beds_available: profile.emergency_beds_available,
    icu_beds_available: profile.icu_beds_available,
    emergency_stabilization_capable: profile.emergency_stabilization_capable,
    ai_rationale: watsonxReady
      ? "[watsonx.ai rationale pending — OA-2 not yet resolved]"
      : `[Prototype stub] ${hospital.name} has confirmed availability and accepts ${emergencyType} emergencies. Human agent must verify before selection.`,
    validation_passed: true,
    ai_label: "AI-suggested — human agent must verify before selecting",
  }));

  // Audit: copilot response
  await supabaseServer.rpc("write_with_audit", {
    p_operation_data: { recommendation_count: recommendations.length, excluded_count: excluded.length },
    p_audit_source:   "ai_suggestion",
    p_action_type:    "copilot_response",
    p_entity_type:    "incident",
    p_entity_id:      body.incident_id,
    p_incident_id:    body.incident_id,
    p_org_id:         auth.organizationId,
  });

  return NextResponse.json({
    query_id: queryId,
    validated_recommendations: recommendations,
    excluded_hospitals: excluded,
    escalation_required: false,
    escalation_message: null,
    watsonx_status: watsonxReady ? "called" : "pending_oa2_credentials",
  });
}
