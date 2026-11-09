import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";

/**
 * POST /api/incidents — Citizen emergency intake stub
 *
 * This is a development stub that validates the request shape and returns
 * a synthetic 201 response. Full database wiring (Supabase, org routing,
 * audit log) is handled in the backend implementation task.
 *
 * Request/response shape per Architecture v1.7 §4
 */

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

  // Generate a synthetic incident ID and reference number
  // Format: RRAI-YYYYMMDD-NNNN  (per Architecture §4)
  const incidentId = randomUUID();
  const now = new Date();
  const datePart =
    now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, "0") +
    String(now.getDate()).padStart(2, "0");
  const seqPart = String(Math.floor(Math.random() * 9000) + 1000); // 4-digit synthetic sequence
  const referenceNumber = `RRAI-${datePart}-${seqPart}`;

  // TODO (backend task): persist incident to Supabase with:
  //   - organization_id (determined server-side by routing config — Org A for MVP)
  //   - status: "new"
  //   - source_type: "citizen_portal"
  //   - all submitted fields
  //   - write audit_log entry: action_type "incident_submitted", source "human"

  return NextResponse.json(
    {
      incident_id: incidentId,
      reference_number: referenceNumber,
      status: "new",
      message: "Your emergency request has been received.",
    },
    { status: 201 }
  );
}
