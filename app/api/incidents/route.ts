/**
 * POST /api/incidents — Citizen emergency intake (public, no auth required)
 * GET  /api/incidents — List incidents for authenticated agents (org-scoped)
 *
 * Architecture v1.7 §4, §2.2, §7.5
 * Validation logic from Tarun's original stub (tarun0306/RRAI-frontend)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { requireRole } from "@/lib/supabase/middleware";

// ---------------------------------------------------------------------------
// POST — public citizen intake (no authentication required)
// ---------------------------------------------------------------------------

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
    return NextResponse.json({ error: "Invalid JSON in request body." }, { status: 400 });
  }

  // Consent gate — non-negotiable (PRD F1.7, MVP AC-21)
  if (!body.consent_given) {
    return NextResponse.json(
      { error: "CONSENT_REQUIRED", message: "Consent must be provided before submitting an emergency request." },
      { status: 400 }
    );
  }

  // Required field validation (Tarun's original logic preserved)
  const missing: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const value = body[field];
    if (value === undefined || value === null || value === "") missing.push(field);
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "MISSING_REQUIRED_FIELDS", message: `Required fields missing: ${missing.join(", ")}`, fields: missing },
      { status: 400 }
    );
  }

  if (typeof body.persons_affected !== "number" || body.persons_affected < 1) {
    return NextResponse.json(
      { error: "INVALID_PERSONS_AFFECTED", message: "persons_affected must be a number of at least 1." },
      { status: 400 }
    );
  }

  // Reference number: RRAI-YYYYMMDD-NNNN (Architecture v1.7 §4)
  const now = new Date();
  const datePart =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const referenceNumber = `RRAI-${datePart}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  // Org routing: assigned server-side — never from request body (Architecture v1.7 §7.5)
  const organizationId = process.env.DEFAULT_CITIZEN_ORG_ID;
  if (!organizationId) {
    console.error("[POST /api/incidents] DEFAULT_CITIZEN_ORG_ID is not set");
    return NextResponse.json(
      { error: "SERVER_CONFIGURATION_ERROR", message: "Service temporarily unavailable." },
      { status: 503 }
    );
  }

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
    console.error("[POST /api/incidents] Insert error:", insertError?.message);
    return NextResponse.json(
      { error: "INCIDENT_CREATE_FAILED", message: "Failed to record your emergency request. Please try again." },
      { status: 500 }
    );
  }

  // Audit log — system-context write (no user JWT on citizen portal)
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
    { incident_id: incident.id, reference_number: incident.reference_number, status: incident.status, message: "Your emergency request has been received." },
    { status: 201 }
  );
}

// ---------------------------------------------------------------------------
// GET — authenticated agent incident list (org-scoped)
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["response_agent", "ambulance_dispatcher", "org_admin"]);
  if (auth.error) return auth.error;

  const { organizationId } = auth;
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const statuses = statusParam ? statusParam.split(",") : null;

  let query = supabaseServer
    .from("incidents")
    .select(
      `id, reference_number, status, source_type,
       caller_name, emergency_type, lga, location_description,
       persons_affected, triage_priority, assigned_agent_id, selected_hospital_id,
       created_at, updated_at`
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (statuses && statuses.length > 0) {
    query = query.in("status", statuses);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[GET /api/incidents]", error.message);
    return NextResponse.json({ error: "FETCH_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ incidents: data });
}
