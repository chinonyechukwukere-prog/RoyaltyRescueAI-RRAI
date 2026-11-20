"use client";

/**
 * Audit Log Viewer — /dashboard/incidents/[id]/audit
 * F9: Immutable incident audit trail for agents and org admins.
 * PRD F9, MVP AC-14, AC-15
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type AuditEntry = {
  id: string;
  action_type: string;
  source: "human" | "ai_suggestion" | "system";
  actor_id: string | null;
  actor_role: string | null;
  entity_type: string;
  detail: Record<string, unknown> | null;
  created_at: string;
};

const SOURCE_STYLES: Record<string, string> = {
  human:         "bg-blue-100 text-blue-800",
  ai_suggestion: "bg-purple-100 text-purple-800",
  system:        "bg-gray-100 text-gray-700",
};

export default function AuditPage() {
  const { id } = useParams<{ id: string }>();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function token() { return sessionStorage.getItem("rrai_token") ?? ""; }

  useEffect(() => {
    fetch(`/api/incidents/${id}/audit`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((j) => {
        if (j.audit_entries) setEntries(j.audit_entries);
        else setError("No audit entries found.");
      })
      .catch(() => setError("Failed to load audit log."))
      .finally(() => setLoading(false));
  }, [id]);

  function formatTime(iso: string) {
    return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "medium" }).format(new Date(iso));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href={`/dashboard/incidents/${id}`} className="text-primary hover:underline">← Incident</Link>
        <span className="text-muted-foreground">/</span>
        <span>Audit Log</span>
      </div>

      <div>
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-lg font-bold text-foreground">Incident Audit Log</h1>
            <p className="text-sm text-muted-foreground">
              Immutable record of all actions, AI suggestions, and human decisions. Append-only — no entry can be edited or deleted.
            </p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0 mt-1">{entries.length} entries</span>
        </div>

        {/* Legend */}
        <div className="flex gap-3 mb-4 text-xs flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span> Human action
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-purple-500"></span> AI suggestion
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-gray-400"></span> System
          </span>
        </div>

        {loading && <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {!loading && entries.length === 0 && !error && (
          <p className="text-sm text-muted-foreground py-8 text-center rounded-xl border border-border">
            No audit entries yet.
          </p>
        )}

        {!loading && entries.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden bg-white">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40 text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left w-44">Time (UTC)</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left w-28">Source</th>
                  <th className="px-4 py-3 text-left w-28">Actor Role</th>
                  <th className="px-4 py-3 text-left">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e) => (
                  <tr key={e.id} className="hover:bg-secondary/10 transition align-top">
                    <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap">
                      {formatTime(e.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {e.action_type.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${SOURCE_STYLES[e.source] ?? "bg-gray-100 text-gray-700"}`}>
                        {e.source.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {e.actor_role?.replace(/_/g, " ") ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-xs">
                      {e.detail ? (
                        <span className="font-mono break-all">
                          {Object.entries(e.detail)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
