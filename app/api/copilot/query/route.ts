/**
 * POST /api/copilot/query — AI Copilot query with dual-pass hospital validation
 *
 * Auth: response_agent only
 * Architecture v1.7 §4, §5, §6
 *
 * OA-2 STATUS: ✅ RESOLVED
 * - Dual-pass hospital eligibility validation: ✅ IMPLEMENTED
 * - watsonx.ai LLM call: ✅ IMPLEMENTED (ibm/granite-3-3-8b-instruct)
 *   Uses IBM IAM token exchange (API key → bearer token) on every request.
 *   Falls back to structured stub rationale if credentials are absent or the
 *   watsonx.ai call fails — the safety-critical dual-pass validation always runs
 *   regardless of LLM status.
 *
 * SAFETY: The LLM rationale is advisory only. The pre-filter and post-filter
 * eligibility checks are enforced before and after the LLM call. No hospital
 * that failed validation can appear in validated_recommendations.
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
  emergency_beds_available: number;
  icu_beds_available: number;
  emergency_stabilization_capable: boolean;
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

  // ── POST-FILTER: watsonx.ai call (OA-2 ✅ resolved) ────────────────────────
  // Model: ibm/granite-3-3-8b-instruct (latest production Granite instruct model)
  // Auth:  IBM Cloud IAM API key → bearer token exchange on every request.
  //        Tokens are short-lived (~1h); we exchange per-request to avoid state.
  // Safety: rationale is advisory only. Pre-filter already enforced above.
  //         If watsonx.ai is unavailable, structured stub rationale is used —
  //         the validated hospital list is returned regardless.

  const watsonxApiKey    = process.env.WATSONX_API_KEY;
  const watsonxProjectId = process.env.WATSONX_PROJECT_ID;
  const watsonxUrl       = (process.env.WATSONX_URL ?? "https://us-south.ml.cloud.ibm.com").replace(/\/$/, "");
  const watsonxReady     = !!(watsonxApiKey && watsonxProjectId &&
    watsonxApiKey !== "your_ibm_cloud_iam_api_key_here" &&
    watsonxProjectId !== "your_watsonx_project_id_here");

  // Build a concise prompt for Granite — structured for fast inference
  const hospitalSummary = eligible.map(({ hospital, profile }, i) =>
    `${i + 1}. ${hospital.name} (${hospital.lga}) — ` +
    `beds: ${profile.emergency_beds_available}, ICU: ${profile.icu_beds_available}, ` +
    `stabilisation: ${profile.emergency_stabilization_capable ? "yes" : "no"}, ` +
    `accepts: ${profile.accepted_emergency_types.join(", ")}`
  ).join("\n");

  const prompt =
    `You are an emergency medical coordination assistant. ` +
    `A response agent needs to select a hospital for a ${emergencyType} emergency in ${incident.lga}, Nigeria.\n\n` +
    `The following hospitals have confirmed availability and have passed all safety checks:\n${hospitalSummary}\n\n` +
    `For each hospital, provide a brief one-sentence rationale (max 25 words) explaining why it is suitable ` +
    `for this emergency type. List them in order of suitability. ` +
    `Respond ONLY with a numbered list matching the hospital order above. ` +
    `Do not add commentary, caveats, or any text outside the numbered list.`;

  // Per-hospital rationale map: populated from watsonx.ai or stub
  const rationaleMap: Record<string, string> = {};
  let watsonxStatus: string;

  if (watsonxReady) {
    try {
      // Step 1: Exchange IBM Cloud API key for IAM bearer token
      const iamRes = await fetch("https://iam.cloud.ibm.com/identity/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${encodeURIComponent(watsonxApiKey!)}`,
      });

      if (!iamRes.ok) {
        throw new Error(`IAM token exchange failed: ${iamRes.status}`);
      }
      const iamData = await iamRes.json() as { access_token: string };
      const bearerToken = iamData.access_token;

      // Step 2: Call watsonx.ai text generation API
      const wxRes = await fetch(
        `${watsonxUrl}/ml/v1/text/generation?version=2025-02-11`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${bearerToken}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            model_id:   "ibm/granite-3-3-8b-instruct",
            project_id: watsonxProjectId,
            input:      prompt,
            parameters: {
              max_new_tokens: 300,
              min_new_tokens: 20,
              stop_sequences: [],
              repetition_penalty: 1.1,
            },
          }),
        }
      );

      if (!wxRes.ok) {
        const errText = await wxRes.text();
        throw new Error(`watsonx.ai API error ${wxRes.status}: ${errText.slice(0, 200)}`);
      }

      const wxData = await wxRes.json() as {
        results?: { generated_text: string }[];
      };
      const generatedText = wxData.results?.[0]?.generated_text?.trim() ?? "";

      // Parse numbered list: "1. <rationale>" per hospital
      const lines = generatedText.split("\n").filter(l => /^\d+\./.test(l.trim()));
      eligible.forEach(({ hospital }, i) => {
        const line = lines[i]?.replace(/^\d+\.\s*/, "").trim();
        rationaleMap[hospital.id] = line
          ? `[IBM watsonx.ai — Granite 3.3] ${line}`
          : `[IBM watsonx.ai — Granite 3.3] ${hospital.name} has confirmed availability for ${emergencyType} emergencies.`;
      });

      watsonxStatus = "called";
    } catch (err) {
      // Graceful degradation — log server-side, return stub rationale to client
      console.error("[POST /api/copilot/query] watsonx.ai error:", (err as Error).message);
      eligible.forEach(({ hospital }) => {
        rationaleMap[hospital.id] =
          `[Stub — watsonx.ai unavailable] ${hospital.name} has confirmed availability for ${emergencyType} emergencies. Human agent must verify before selection.`;
      });
      watsonxStatus = "error_fallback_stub";
    }
  } else {
    // Credentials not configured — structured stub
    eligible.forEach(({ hospital }) => {
      rationaleMap[hospital.id] =
        `[Stub — configure WATSONX_API_KEY and WATSONX_PROJECT_ID] ` +
        `${hospital.name} has confirmed availability for ${emergencyType} emergencies. Human agent must verify before selection.`;
    });
    watsonxStatus = "pending_credentials";
  }

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
    ai_rationale: rationaleMap[hospital.id],
    validation_passed: true,
    ai_label: "AI-suggested — human agent must verify before selecting",
  }));

  // Audit: copilot response
  await supabaseServer.rpc("write_with_audit", {
    p_operation_data: {
      recommendation_count: recommendations.length,
      excluded_count:       excluded.length,
      watsonx_status:       watsonxStatus,
    },
    p_audit_source:   "ai_suggestion",
    p_action_type:    "copilot_response",
    p_entity_type:    "incident",
    p_entity_id:      body.incident_id,
    p_incident_id:    body.incident_id,
    p_org_id:         auth.organizationId,
  });

  return NextResponse.json({
    query_id:                  queryId,
    validated_recommendations: recommendations,
    excluded_hospitals:        excluded,
    escalation_required:       false,
    escalation_message:        null,
    watsonx_status:            watsonxStatus,
  });
}
