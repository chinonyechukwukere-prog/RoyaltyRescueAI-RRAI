"use client";

/**
 * Incident Detail Page — /dashboard/incidents/[id]
 * F2: full incident details, status update, agent notes
 * F3: AI Copilot panel (dual-pass validated recommendations)
 * Architecture v1.7 §4, PRD F2.4, F3
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

// ---- Types ------------------------------------------------------------------

type Incident = {
  id: string;
  reference_number: string;
  status: string;
  source_type: string;
  caller_name: string;
  caller_phone: string;
  location_description: string;
  lga: string;
  emergency_type: string;
  presenting_complaint: string;
  persons_affected: number;
  preferred_language: string;
  language_assistance_required: boolean;
  triage_priority: string | null;
  assigned_agent_id: string | null;
  selected_hospital_id: string | null;
  created_at: string;
  updated_at: string;
};

type HospitalRecommendation = {
  hospital_id: string;
  hospital_name: string;
  lga: string;
  availability_status: string;
  last_verified_at: string;
  accepted_emergency_types: string[];
  emergency_beds_available: number;
  icu_beds_available: number;
  ai_rationale: string;
  ai_label: string;
  validation_passed: boolean;
};

type CopilotResponse = {
  query_id: string;
  validated_recommendations: HospitalRecommendation[];
  excluded_hospitals: { hospital_id: string; hospital_name: string; exclusion_reason: string }[];
  escalation_required: boolean;
  escalation_message: string | null;
  watsonx_status: string;
};

const STATUS_OPTIONS = [
  "new", "in_progress", "hospital_selected", "hospital_confirmed",
  "acceptance_confirmed", "dispatched", "en_route", "arrived", "closed",
];

const TRIAGE_OPTIONS = ["immediate", "urgent", "delayed", "expectant"];

// ---- Component --------------------------------------------------------------

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [incident, setIncident] = useState<Incident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Status / triage update
  const [newStatus, setNewStatus] = useState("");
  const [newTriage, setNewTriage] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  // AI Copilot
  const [queryText, setQueryText] = useState("");
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotResult, setCopilotResult] = useState<CopilotResponse | null>(null);
  const [copilotError, setCopilotError] = useState<string | null>(null);

  function token() { return sessionStorage.getItem("rrai_token") ?? ""; }

  // Load incident
  useEffect(() => {
    if (!id) return;
    fetch(`/api/incidents/${id}`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((j) => {
        if (j.incident) {
          setIncident(j.incident);
          setNewStatus(j.incident.status);
          setNewTriage(j.incident.triage_priority ?? "");
        } else {
          setError("Incident not found.");
        }
      })
      .catch(() => setError("Failed to load incident."))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleUpdate() {
    setUpdating(true);
    setUpdateMsg(null);
    try {
      const res = await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ status: newStatus, triage_priority: newTriage || undefined }),
      });
      const j = await res.json();
      if (!res.ok) { setUpdateMsg(`Error: ${j.error ?? "Update failed."}`); return; }
      setIncident((prev) => prev ? { ...prev, ...j.incident } : prev);
      setUpdateMsg("Updated successfully.");
    } catch {
      setUpdateMsg("Error: unable to update.");
    } finally {
      setUpdating(false);
    }
  }

  async function handleCopilotQuery() {
    if (!queryText.trim()) return;
    setCopilotLoading(true);
    setCopilotResult(null);
    setCopilotError(null);
    try {
      const res = await fetch("/api/copilot/query", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ incident_id: id, query_text: queryText }),
      });
      const j = await res.json();
      if (!res.ok) { setCopilotError(j.message ?? j.error ?? "Query failed."); return; }
      setCopilotResult(j);
    } catch {
      setCopilotError("Unable to reach AI copilot.");
    } finally {
      setCopilotLoading(false);
    }
  }

  function formatTime(iso: string) {
    return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  }

  // ---- Render ----------------------------------------------------------------

  if (loading) return <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>;
  if (error || !incident) {
    return (
      <div>
        <Link href="/dashboard" className="text-sm text-primary hover:underline">← Back to Incidents</Link>
        <p className="mt-4 text-sm text-red-600">{error ?? "Incident not found."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link href="/dashboard" className="text-primary hover:underline">Incidents</Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-mono font-medium">{incident.reference_number}</span>
      </div>

      {/* Alert banner */}
      {incident.status === "alert_issued" && (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 font-medium">
          ⚠ Safety alert: hospital availability changed after patient acceptance. Human review required before dispatch can proceed.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: incident details (2 cols) */}
        <div className="lg:col-span-2 space-y-5">

          {/* Incident summary */}
          <div className="rounded-xl border border-border bg-white p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-lg font-bold text-foreground">{incident.reference_number}</h1>
                <p className="text-sm text-muted-foreground capitalize">
                  {incident.emergency_type?.replace(/_/g, " ")} · {incident.lga}
                  {incident.source_type === "mock_integration" && (
                    <span className="ml-2 text-xs border border-border rounded px-1.5 py-0.5">mock integration</span>
                  )}
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{formatTime(incident.created_at)}</span>
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 text-sm">
              <div><dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Caller</dt><dd>{incident.caller_name}</dd></div>
              <div><dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Contact</dt><dd>{incident.caller_phone}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Location</dt><dd>{incident.location_description}</dd></div>
              <div className="sm:col-span-2"><dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Presenting complaint</dt><dd>{incident.presenting_complaint}</dd></div>
              <div><dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Persons affected</dt><dd>{incident.persons_affected}</dd></div>
              <div><dt className="text-muted-foreground text-xs uppercase tracking-wide mb-0.5">Language</dt><dd>{incident.preferred_language}</dd></div>
            </dl>
          </div>

          {/* Status & triage update */}
          <div className="rounded-xl border border-border bg-white p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Update Incident</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground uppercase tracking-wide">Triage priority</label>
                <select
                  value={newTriage}
                  onChange={(e) => setNewTriage(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— not set —</option>
                  {TRIAGE_OPTIONS.map((t) => (
                    <option key={t} value={t} className="capitalize">{t}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleUpdate}
                disabled={updating}
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {updating ? "Saving…" : "Save changes"}
              </button>
              {updateMsg && (
                <span className={`text-xs ${updateMsg.startsWith("Error") ? "text-red-600" : "text-green-700"}`}>
                  {updateMsg}
                </span>
              )}
            </div>
          </div>

          {/* AI Copilot panel — F3 */}
          <div className="rounded-xl border border-border bg-white p-6">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-semibold text-foreground">AI Emergency Copilot</h2>
              <span className="text-xs text-muted-foreground italic">AI-suggested — human agent must verify</span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Ask about hospital availability, capability, or coordination options. All recommendations are server-validated before display.
            </p>

            <div className="flex gap-2">
              <input
                type="text"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCopilotQuery()}
                placeholder={`e.g. "Which hospitals near ${incident.lga} accept ${incident.emergency_type?.replace(/_/g, " ")} emergencies?"`}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                onClick={handleCopilotQuery}
                disabled={copilotLoading || !queryText.trim()}
                className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50 shrink-0"
              >
                {copilotLoading ? "Querying…" : "Query"}
              </button>
            </div>

            {copilotError && (
              <p className="mt-3 text-sm text-red-600">{copilotError}</p>
            )}

            {copilotResult && (
              <div className="mt-5 space-y-4">
                {/* Watsonx status badge */}
                {copilotResult.watsonx_status !== "called" && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    ⚠ IBM watsonx.ai not yet connected (OA-2 pending). Validation logic is active — recommendations below are server-validated against the hospital registry.
                  </div>
                )}

                {/* Escalation */}
                {copilotResult.escalation_required && (
                  <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <strong>Human escalation required.</strong> {copilotResult.escalation_message}
                  </div>
                )}

                {/* Recommendations */}
                {copilotResult.validated_recommendations.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Validated recommendations ({copilotResult.validated_recommendations.length})
                    </h3>
                    <div className="space-y-3">
                      {copilotResult.validated_recommendations.map((r) => (
                        <div key={r.hospital_id} className="rounded-lg border border-border p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-sm">{r.hospital_name}</p>
                              <p className="text-xs text-muted-foreground">{r.lga}</p>
                            </div>
                            <span className="text-xs bg-green-100 text-green-800 rounded-full px-2 py-0.5 shrink-0">confirmed</span>
                          </div>
                          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <div><dt className="inline">ED beds: </dt><dd className="inline font-medium text-foreground">{r.emergency_beds_available}</dd></div>
                            <div><dt className="inline">ICU beds: </dt><dd className="inline font-medium text-foreground">{r.icu_beds_available}</dd></div>
                            <div className="col-span-2"><dt className="inline">Accepts: </dt><dd className="inline">{r.accepted_emergency_types.join(", ")}</dd></div>
                            <div className="col-span-2"><dt className="inline">Verified: </dt><dd className="inline">{new Date(r.last_verified_at).toLocaleString("en-NG")}</dd></div>
                          </dl>
                          <p className="mt-2 text-xs text-muted-foreground italic border-t border-border pt-2">
                            {r.ai_rationale}
                          </p>
                          <p className="mt-1 text-xs font-medium text-amber-700">{r.ai_label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Excluded hospitals */}
                {copilotResult.excluded_hospitals.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      {copilotResult.excluded_hospitals.length} hospital(s) excluded by validation
                    </summary>
                    <ul className="mt-2 space-y-1 pl-4">
                      {copilotResult.excluded_hospitals.map((h) => (
                        <li key={h.hospital_id} className="text-muted-foreground">
                          {h.hospital_name} — <span className="italic">{h.exclusion_reason.replace(/_/g, " ")}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: metadata sidebar (1 col) */}
        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-white p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Incident Info</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-medium capitalize">{incident.status.replace(/_/g, " ")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Triage</dt>
                <dd className="capitalize">{incident.triage_priority ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Source</dt>
                <dd className="capitalize">{incident.source_type.replace(/_/g, " ")}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="text-xs">{formatTime(incident.updated_at)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-white p-5">
            <h2 className="text-sm font-semibold text-foreground mb-2">Quick Actions</h2>
            <p className="text-xs text-muted-foreground">
              Dispatch, patient acceptance, and handover controls are implemented in Stage 3.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
