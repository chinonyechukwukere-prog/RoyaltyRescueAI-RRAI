import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/incidents — Citizen emergency intake
 *
 * Public route — no authentication required (Architecture v1.7 §2.2).
 * Accepts a citizen emergency request, persists it to Supabase, and
 * returns an incident reference number to the caller.
 *
 * Validation logic preserved from Tarun's original stub (tarun0306/RRAI-frontend).
 * Database wiring added for Stage 1 Foundation — Architecture v1.7 §4, §7.5.
 *
 * Organization routing: all citizen submissions are assigned server-side to
 * DEFAULT_CITIZEN_ORG_ID (Org A — RapidResponse NG). The citizen is never
 * informed which organization receives their request.
 */

import { supabaseServer } from "@/lib/supabase/server";

const REQUIRED_FIELDS = [
  "caller_name",
  "caller_phone",
  "location_description",
  "lga",
  "emergency_type",
  "presenting_complaint",
  "persons_affected",
  "preferred_language",
] as const;

type IncidentRequest = {
  caller_name: string;
  caller_phone: string;
  location_description: string;
  lga: string;
  emergency_type: string;
  presenting_complaint: string;
  persons_affected: number;
  preferred_language: string;
  consent_given?: boolean;
};

export async function POST(request: NextRequest) {
  let body: IncidentRequest;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON in request body." },
      { status: 400 }
    );
  }

  // Consent gate — non-negotiable per PRD F1.7
  if (!body.consent_given) {
    return NextResponse.json(
      {
        error: "CONSENT_REQUIRED",
        message: "Consent must be provided before submitting an emergency request.",
      },
      { status: 400 }
    );
  }

  // Required field validation
  const missing: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null || value === "") {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: "MISSING_REQUIRED_FIELDS",
        message: `The following fields are required: ${missing.join(", ")}`,
        fields: missing,
      },
      { status: 400 }
    );
  }

  // Persons affected must be at least 1
  if (typeof body.persons_affected !== "number" || body.persons_affected < 1) {
    return NextResponse.json(
      {
        error: "INVALID_PERSONS_AFFECTED",
        message: "persons_affected must be a number of at least 1.",
      },
      { status: 400 }
    );
  }

  // Generate reference number: RRAI-YYYYMMDD-NNNN (Architecture v1.7 §4)
  const now = new Date();
  const datePart =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const seqPart = String(Math.floor(Math.random() * 9000) + 1000);
  const referenceNumber = `RRAI-${datePart}-${seqPart}`;

  // Organization routing: assigned server-side — never from request body.
  // Architecture v1.7 §7.5
  const organizationId = process.env.DEFAULT_CITIZEN_ORG_ID;
  if (!organizationId) {
    console.error("[incidents/route] DEFAULT_CITIZEN_ORG_ID is not set.");
    return NextResponse.json(
      { error: "SERVER_CONFIGURATION_ERROR", message: "Service temporarily unavailable." },
      { status: 503 }
    );
  }

  // Persist incident to Supabase via service_role client (no user JWT present).
  // Architecture v1.7 §7.5 — citizen portal uses system-context write.
  const { data: incident, error: insertError } = await supabaseServer
    .from("incidents")
    .insert({
      organization_id:      organizationId,
      status:               "new",
      source_type:          "citizen_portal",
      caller_name:          body.caller_name,
      caller_phone:         body.caller_phone,
      location_description: body.location_description,
      lga:                  body.lga,
      emergency_type:       body.emergency_type,
      presenting_complaint: body.presenting_complaint,
      persons_affected:     body.persons_affected,
      preferred_language:   body.preferred_language,
      reference_number:     referenceNumber,
    })
    .select("id, reference_number, status")
    .single();

  if (insertError || !incident) {
    console.error("[incidents/route] Insert error:", insertError?.message);
    return NextResponse.json(
      { error: "INCIDENT_CREATE_FAILED", message: "Failed to record your emergency request. Please try again." },
      { status: 500 }
    );
  }

  // Write audit log entry via write_with_audit() RPC (system-context path).
  // Architecture v1.7 §10.1a Layer 1c — system-context, p_org_id required.
  await supabaseServer.rpc("write_with_audit", {
    p_operation_data: { caller_name: body.caller_name, emergency_type: body.emergency_type },
    p_audit_source:   "system",
    p_action_type:    "incident_created",
    p_entity_type:    "incident",
    p_entity_id:      incident.id,
    p_incident_id:    incident.id,
    p_org_id:         organizationId,
  });

  return NextResponse.json(
    {
      incident_id:      incident.id,
      reference_number: incident.reference_number,
      status:           incident.status,
      message:          "Your emergency request has been received.",
    },
    { status: 201 }
  );
}
