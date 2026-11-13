"use client";

/**
 * Agent Incident List — /dashboard
 * F2: incident list view, filterable by status, real-time polling
 * Architecture v1.7 §4, PRD F2.1–F2.3
 */

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

const STATUSES = [
  "new", "in_progress", "hospital_selected", "hospital_confirmed",
  "acceptance_confirmed", "dispatched", "en_route", "arrived", "alert_issued", "closed",
];

const STATUS_COLORS: Record<string, string> = {
  new:                  "bg-blue-100 text-blue-800",
  in_progress:          "bg-yellow-100 text-yellow-800",
  hospital_selected:    "bg-purple-100 text-purple-800",
  hospital_confirmed:   "bg-indigo-100 text-indigo-800",
  acceptance_confirmed: "bg-teal-100 text-teal-800",
  dispatched:           "bg-orange-100 text-orange-800",
  en_route:             "bg-orange-200 text-orange-900",
  arrived:              "bg-green-100 text-green-800",
  alert_issued:         "bg-red-100 text-red-800",
  closed:               "bg-gray-100 text-gray-600",
};

type Incident = {
  id: string;
  reference_number: string;
  status: string;
  source_type: string;
  caller_name: string;
  emergency_type: string;
  lga: string;
  triage_priority: string | null;
  created_at: string;
};

export default function DashboardPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");

  const fetchIncidents = useCallback(async () => {
    const token = sessionStorage.getItem("rrai_token");
    if (!token) return;

    const params = statusFilter ? `?status=${statusFilter}` : "";
    try {
      const res = await fetch(`/api/incidents${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setIncidents(json.incidents ?? []);
      setError(null);
    } catch {
      setError("Unable to load incidents. Check connection.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  // Initial load + polling every 15 s (PRD F2.3)
  useEffect(() => {
    fetchIncidents();
    const id = setInterval(fetchIncidents, 15_000);
    return () => clearInterval(id);
  }, [fetchIncidents]);

  function formatTime(iso: string) {
    return new Intl.DateTimeFormat("en-NG", {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(iso));
  }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-foreground">Incident Queue</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Active emergency incidents assigned to your organisation
          </p>
        </div>
        <button
          onClick={fetchIncidents}
          className="text-xs text-muted-foreground hover:text-foreground border border-border rounded px-3 py-1.5 transition"
        >
          Refresh
        </button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setStatusFilter("")}
          className={`text-xs rounded-full px-3 py-1 border transition ${
            statusFilter === "" ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground"
          }`}
        >
          All
        </button>
        {["new", "in_progress", "alert_issued", "dispatched", "closed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs rounded-full px-3 py-1 border transition ${
              statusFilter === s ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:border-foreground"
            }`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
      </div>

      {/* Incident list */}
      {loading && (
        <div className="text-sm text-muted-foreground py-12 text-center">Loading incidents…</div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-3 mb-4">
          {error}
        </div>
      )}

      {!loading && !error && incidents.length === 0 && (
        <div className="text-sm text-muted-foreground py-12 text-center rounded-xl border border-border">
          No incidents found{statusFilter ? ` with status "${statusFilter}"` : ""}.
        </div>
      )}

      {!loading && incidents.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Reference</th>
                <th className="px-4 py-3 text-left">Caller</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">LGA</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Received</th>
                <th className="px-4 py-3 text-left sr-only">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {incidents.map((inc) => (
                <tr key={inc.id} className="hover:bg-secondary/20 transition">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-primary">
                    {inc.reference_number}
                    {inc.source_type === "mock_integration" && (
                      <span className="ml-2 text-xs text-muted-foreground">[mock]</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{inc.caller_name}</td>
                  <td className="px-4 py-3 capitalize">{inc.emergency_type?.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-muted-foreground">{inc.lga}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[inc.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {inc.status.replace(/_/g, " ")}
                    </span>
                    {inc.status === "alert_issued" && (
                      <span className="ml-1 text-red-600" title="Action required">⚠</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {formatTime(inc.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/incidents/${inc.id}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
