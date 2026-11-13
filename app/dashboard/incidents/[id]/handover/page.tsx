"use client";

/**
 * Handover Summary Page — /dashboard/incidents/[id]/handover
 * F8: Agent generates clinical handover; hospital admin acknowledges.
 * PRD F8, MVP AC-12, AC-13
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Handover = {
  id: string;
  patient_name: string;
  presenting_complaint: string;
  triage_priority: string | null;
  dispatch_status: string | null;
  agent_notes: string | null;
  generated_at: string;
  acknowledged_at: string | null;
};

export default function HandoverPage() {
  const { id } = useParams<{ id: string }>();
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentNotes, setAgentNotes] = useState("");
  const [generating, setGenerating] = useState(false);
  const [acknowledging, setAcknowledging] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [userRole, setUserRole] = useState<string>("");

  function token() { return sessionStorage.getItem("rrai_token") ?? ""; }

  useEffect(() => {
    const user = JSON.parse(sessionStorage.getItem("rrai_user") ?? "{}");
    setUserRole(user.role ?? "");

    fetch(`/api/incidents/${id}/handover`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((j) => setHandovers(j.handovers ?? []))
      .catch(() => setMsg({ type: "error", text: "Failed to load handover summary." }))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleGenerate() {
    setGenerating(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/incidents/${id}/handover`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ agent_notes: agentNotes || undefined }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg({ type: "error", text: j.message ?? j.error ?? "Failed." }); return; }
      setMsg({ type: "success", text: "Handover summary generated." });
      // Reload
      const updated = await fetch(`/api/incidents/${id}/handover`, { headers: { Authorization: `Bearer ${token()}` } });
      setHandovers((await updated.json()).handovers ?? []);
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setGenerating(false);
    }
  }

  async function handleAcknowledge() {
    setAcknowledging(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/incidents/${id}/handover`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: "{}",
      });
      const j = await res.json();
      if (!res.ok) { setMsg({ type: "error", text: j.message ?? j.error ?? "Failed." }); return; }
      setMsg({ type: "success", text: "Handover acknowledged." });
      setHandovers((prev) => prev.map((h, i) => i === 0 ? { ...h, acknowledged_at: new Date().toISOString() } : h));
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setAcknowledging(false);
    }
  }

  const latest = handovers[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href={`/dashboard/incidents/${id}`} className="text-primary hover:underline">← Incident</Link>
        <span className="text-muted-foreground">/</span>
        <span>Handover Summary</span>
      </div>

      {msg && (
        <div role="alert" className={`rounded-md border px-4 py-3 text-sm max-w-xl ${
          msg.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {msg.text}
        </div>
      )}

      {/* Generate (agent) */}
      {userRole === "response_agent" && !latest && (
        <div className="rounded-xl border border-border bg-white p-6 max-w-xl space-y-4">
          <div>
            <h1 className="text-lg font-bold text-foreground mb-1">Generate Handover Summary</h1>
            <p className="text-sm text-muted-foreground">
              The receiving hospital will see this summary before the patient arrives.
              Fields marked <span className="italic">AI-suggested</span> are drawn from the incident record.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Agent Notes (optional)</label>
            <textarea
              rows={3}
              value={agentNotes}
              onChange={(e) => setAgentNotes(e.target.value)}
              placeholder="Additional clinical context, medication, allergies…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate Handover Summary"}
          </button>
        </div>
      )}

      {/* Summary card */}
      {!loading && latest && (
        <div className="rounded-xl border border-border bg-white p-6 max-w-xl space-y-4">
          <div className="flex items-start justify-between">
            <h1 className="text-lg font-bold text-foreground">Clinical Handover Summary</h1>
            {latest.acknowledged_at ? (
              <span className="text-xs bg-green-100 text-green-800 rounded-full px-2 py-0.5">Acknowledged</span>
            ) : (
              <span className="text-xs bg-yellow-100 text-yellow-800 rounded-full px-2 py-0.5">Pending acknowledgment</span>
            )}
          </div>

          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5">
            All patient details are fictional and used for demonstration purposes only.
          </p>

          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                Patient Name <span className="italic">(agent-entered)</span>
              </dt>
              <dd className="font-medium">{latest.patient_name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Triage Priority</dt>
              <dd className="capitalize font-medium">{latest.triage_priority ?? "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                Presenting Complaint <span className="italic">(agent-entered)</span>
              </dt>
              <dd>{latest.presenting_complaint}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Dispatch Status</dt>
              <dd className="capitalize">{latest.dispatch_status?.replace("_", " ") ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Generated</dt>
              <dd className="text-xs">{new Date(latest.generated_at).toLocaleString("en-NG")}</dd>
            </div>
            {latest.agent_notes && (
              <div className="sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Agent Notes</dt>
                <dd className="text-sm">{latest.agent_notes}</dd>
              </div>
            )}
          </dl>

          {/* Acknowledge (hospital_admin) */}
          {userRole === "hospital_admin" && !latest.acknowledged_at && (
            <div className="border-t border-border pt-4">
              <button
                onClick={handleAcknowledge}
                disabled={acknowledging}
                className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {acknowledging ? "Confirming…" : "Acknowledge Receipt"}
              </button>
              <p className="text-xs text-muted-foreground mt-2">
                Confirming receipt means your team is aware of this patient&apos;s incoming condition.
              </p>
            </div>
          )}

          {latest.acknowledged_at && (
            <p className="text-sm text-green-700 font-medium border-t border-border pt-3">
              ✓ Acknowledged at {new Date(latest.acknowledged_at).toLocaleString("en-NG")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
