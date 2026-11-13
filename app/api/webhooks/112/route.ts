/**
 * POST /api/webhooks/112 — Mock 112 Integration Webhook
 * F11: Simulates an external 112-partner dispatch alert creating an incident in Org B.
 *
 * Authentication: shared secret header X-Webhook-Secret (Architecture v1.7 §12)
 * Organisation: all mock webhook incidents are attributed to WEBHOOK_ORG_B_ID (Org B)
 * Source type: 'mock_integration' — visible in audit log and dashboard
 *
 * This endpoint is conditional (MVP Scope v1.1 §6 — F11).
 * It does NOT connect to any live Nigerian 112 service.
 * PRD F11, MVP AC-18, Architecture v1.7 §2.3
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

type WebhookPayload = {
  caller_name: string;
  caller_phone: string;
  location_description: string;
  lga: string;
  emergency_type: string;
  presenting_complaint: string;
  persons_affected?: number;
  preferred_language?: string;
};

export async function POST(request: NextRequest) {
  // Authenticate the webhook call with shared secret
  const secret = request.headers.get("X-Webhook-Secret");
  const expectedSecret = process.env.WEBHOOK_112_SECRET;

  if (!expectedSecret) {
    console.error("[POST /api/webhooks/112] WEBHOOK_112_SECRET not configured");
    return NextResponse.json({ error: "SERVER_CONFIGURATION_ERROR" }, { status: 503 });
  }

  if (!secret || secret !== expectedSecret) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Invalid or missing webhook secret." },
      { status: 401 }
    );
  }

  // Organisation: Org B — always server-side, never from request body
  const organizationId = process.env.WEBHOOK_ORG_B_ID;
  if (!organizationId) {
    console.error("[POST /api/webhooks/112] WEBHOOK_ORG_B_ID not configured");
    return NextResponse.json({ error: "SERVER_CONFIGURATION_ERROR" }, { status: 503 });
  }

  let body: WebhookPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Validate required fields
  const required = [
    "caller_name", "caller_phone", "location_description",
    "lga", "emergency_type", "presenting_complaint",
  ] as const;
  const missing = required.filter((f) => !body[f]?.trim());
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "MISSING_REQUIRED_FIELDS", fields: missing },
      { status: 400 }
    );
  }

  // Reference number: RRAI-YYYYMMDD-NNNN
  const now = new Date();
  const datePart =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const referenceNumber = `RRAI-${datePart}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  const { data: incident, error: insertErr } = await supabaseServer
    .from("incidents")
    .insert({
      organization_id:      organizationId,
      status:               "new",
      source_type:          "mock_integration",    // Distinguishes from citizen portal (AC-18)
      caller_name:          body.caller_name,
      caller_phone:         body.caller_phone,
      location_description: body.location_description,
      lga:                  body.lga,
      emergency_type:       body.emergency_type,
      presenting_complaint: body.presenting_complaint,
      persons_affected:     body.persons_affected ?? 1,
      preferred_language:   body.preferred_language ?? "en",
      reference_number:     referenceNumber,
    })
    .select("id, reference_number, status, source_type")
    .single();

  if (insertErr || !incident) {
    console.error("[POST /api/webhooks/112] Insert error:", insertErr?.message);
    return NextResponse.json({ error: "INCIDENT_CREATE_FAILED" }, { status: 500 });
  }

  // Audit — system-context, source: 'system', action: 'incident_created'
  await supabaseServer.rpc("write_with_audit", {
    p_operation_data: {
      source_type:    "mock_integration",
      caller_name:    body.caller_name,
      emergency_type: body.emergency_type,
      webhook_origin: "mock-112-integration",
    },
    p_audit_source: "system",
    p_action_type:  "incident_created",
    p_entity_type:  "incident",
    p_entity_id:    incident.id,
    p_incident_id:  incident.id,
    p_org_id:       organizationId,
  });

  return NextResponse.json(
    {
      incident_id:      incident.id,
      reference_number: incident.reference_number,
      status:           incident.status,
      source_type:      incident.source_type,
      message:          "Mock 112 incident created and routed to Org B dashboard.",
    },
    { status: 201 }
  );
}
