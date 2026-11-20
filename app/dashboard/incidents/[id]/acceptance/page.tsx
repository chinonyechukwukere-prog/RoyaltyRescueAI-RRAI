"use client";

/**
 * Patient Acceptance Page — /dashboard/incidents/[id]/acceptance
 * F6: Hospital admin confirms patient acceptance for a specific incident.
 * PRD F6, MVP AC-08, AC-09
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type AcceptanceRecord = {
  id: string;
  accepted_at: string;
  operationally_valid: boolean;
  invalidated_at: string | null;
  invalidated_reason: string | null;
  notes: string | null;
};

export default function AcceptancePage() {
  const { id } = useParams<{ id: string }>();
  const [records, setRecords] = useState<AcceptanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function token() { return sessionStorage.getItem("rrai_token") ?? ""; }

  useEffect(() => {
    fetch(`/api/incidents/${id}/acceptance`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((j) => setRecords(j.acceptance_records ?? []))
      .catch(() => setMsg({ type: "error", text: "Failed to load acceptance records." }))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleAccept() {
    setSubmitting(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/incidents/${id}/acceptance`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ notes: notes || undefined }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: j.message ?? j.error ?? "Acceptance failed." });
        return;
      }
      setMsg({ type: "success", text: "Patient acceptance confirmed. Dispatch can now proceed." });
      setRecords((prev) => [j.acceptance, ...prev]);
    } catch {
      setMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  const activeRecord = records.find((r) => r.operationally_valid);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href={`/dashboard/incidents/${id}`} className="text-primary hover:underline">← Incident</Link>
        <span className="text-muted-foreground">/</span>
        <span>Patient Acceptance</span>
      </div>

      <div className="rounded-xl border border-border bg-white p-6 max-w-xl">
        <h1 className="text-lg font-bold text-foreground mb-1">Patient Acceptance</h1>
        <p className="text-sm text-muted-foreground mb-5">
          Confirming acceptance means your hospital is prepared to receive this patient.
          This is a required step before ambulance dispatch can proceed.
        </p>

        {msg && (
          <div role="alert" className={`rounded-md border px-4 py-3 text-sm mb-5 ${
            msg.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}>
            {msg.text}
          </div>
        )}

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!loading && activeRecord && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 mb-5">
            ✓ Active acceptance confirmed at {new Date(activeRecord.accepted_at).toLocaleString("en-NG")}
          </div>
        )}

        {!loading && !activeRecord && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Notes (optional)</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any relevant preparation notes…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <button
              onClick={handleAccept}
              disabled={submitting}
              className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Confirming…" : "Confirm Patient Acceptance"}
            </button>
          </div>
        )}

        {records.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Acceptance History</h2>
            <ul className="space-y-2 text-xs">
              {records.map((r) => (
                <li key={r.id} className={`rounded border px-3 py-2 ${r.operationally_valid ? "border-green-200 bg-green-50" : "border-border bg-secondary/20"}`}>
                  <span className="font-medium">{r.operationally_valid ? "Active" : "Voided"}</span>
                  {" · "}
                  {new Date(r.accepted_at).toLocaleString("en-NG")}
                  {r.invalidated_reason && <span className="text-muted-foreground"> · {r.invalidated_reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
