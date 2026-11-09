/**
 * API utility for the RRAI Customer Portal.
 * All interactions with the backend go through this module.
 *
 * POST /api/incidents — citizen emergency intake
 * Request/response shape per Architecture v1.7 §4
 */

export interface IncidentSubmitRequest {
  caller_name: string;
  caller_phone: string;
  location_description: string;
  lga: string;
  emergency_type: string;
  presenting_complaint: string;
  persons_affected: number;
  preferred_language: string;
  consent_given: true;
}

export interface IncidentSubmitResponse {
  incident_id: string;
  reference_number: string;
  status: "new";
  message: string;
}

export async function submitIncident(
  data: IncidentSubmitRequest
): Promise<IncidentSubmitResponse> {
  // In development, calls the local Next.js API route.
  // In production, NEXT_PUBLIC_API_URL can point to a separate backend.
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

  const res = await fetch(`${baseUrl}/api/incidents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    let errorMsg = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) errorMsg = body.error;
      else if (body?.message) errorMsg = body.message;
    } catch {
      // ignore json parse failure — use status code message
    }
    throw new Error(errorMsg);
  }

  const json = await res.json();
  return json as IncidentSubmitResponse;
}
