"use client";

/**
 * Organisation Admin Panel — /dashboard/admin
 * F10: Read-only view of org profile, user roster, and incident summary stats.
 * Demonstrates multi-org architecture — each org admin sees only their own organisation.
 * PRD F10, MVP AC-17, Architecture v1.7 §7.4 (D4)
 */

import { useEffect, useState } from "react";
import Link from "next/link";

type Organization = {
  id: string;
  name: string;
  type: string;
  status: string;
  created_at: string;
};

type OrgUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  hospital_id: string | null;
  is_active: boolean;
};

const ROLE_COLORS: Record<string, string> = {
  org_admin:            "bg-indigo-100 text-indigo-800",
  response_agent:       "bg-blue-100 text-blue-800",
  ambulance_dispatcher: "bg-orange-100 text-orange-800",
  hospital_admin:       "bg-teal-100 text-teal-800",
};

export default function AdminPage() {
  const [org, setOrg] = useState<Organization | null>(null);
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [incidentSummary, setIncidentSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function token() { return sessionStorage.getItem("rrai_token") ?? ""; }

  useEffect(() => {
    fetch("/api/admin/org", { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((j) => {
        if (j.organization) {
          setOrg(j.organization);
          setUsers(j.users ?? []);
          setIncidentSummary(j.incident_summary ?? {});
        } else {
          setError(j.error ?? "Failed to load organisation data.");
        }
      })
      .catch(() => setError("Network error. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const totalIncidents = Object.values(incidentSummary).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Organisation Admin Panel</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Read-only view of your organisation profile, users, and operational statistics.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-primary hover:underline">
          ← Incidents
        </Link>
      </div>

      {/* Prototype notice */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        <strong>Prototype demonstration.</strong> This panel shows a pre-configured synthetic organisation.
        Self-service organisation registration, user creation, and role editing are Phase 2 features.
        All organisations and users shown are entirely fictional.
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && org && (
        <>
          {/* Org profile card */}
          <div className="rounded-xl border border-border bg-white p-6">
            <h2 className="text-sm font-semibold text-foreground mb-4">Organisation Profile</h2>
            <dl className="grid gap-3 sm:grid-cols-3 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Name</dt>
                <dd className="font-medium">{org.name}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Type</dt>
                <dd className="capitalize">{org.type.replace(/_/g, " ")}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Status</dt>
                <dd>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    org.status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}>
                    {org.status}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Organisation ID</dt>
                <dd className="font-mono text-xs text-muted-foreground">{org.id}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">Created</dt>
                <dd className="text-xs">{new Date(org.created_at).toLocaleDateString("en-NG")}</dd>
              </div>
            </dl>
          </div>

          {/* Incident summary stats */}
          {totalIncidents > 0 && (
            <div className="rounded-xl border border-border bg-white p-6">
              <h2 className="text-sm font-semibold text-foreground mb-4">Incident Summary</h2>
              <div className="flex flex-wrap gap-3">
                {Object.entries(incidentSummary).map(([status, count]) => (
                  <div key={status} className="rounded-lg border border-border px-4 py-2 text-center min-w-[6rem]">
                    <p className="text-xl font-bold text-foreground">{count}</p>
                    <p className="text-xs text-muted-foreground capitalize mt-0.5">{status.replace(/_/g, " ")}</p>
                  </div>
                ))}
                <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-center min-w-[6rem]">
                  <p className="text-xl font-bold text-primary">{totalIncidents}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Total</p>
                </div>
              </div>
            </div>
          )}

          {/* User roster */}
          <div className="rounded-xl border border-border bg-white overflow-hidden">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">User Accounts</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {users.length} account{users.length !== 1 ? "s" : ""} · scoped to this organisation only
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-muted-foreground text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-secondary/10 transition">
                    <td className="px-4 py-3 font-medium">{u.name}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[u.role] ?? "bg-gray-100 text-gray-700"}`}>
                        {u.role.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs ${u.is_active ? "text-green-700" : "text-muted-foreground"}`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            User creation, role assignment, and organisation onboarding are planned Phase 2 features.
          </p>
        </>
      )}
    </div>
  );
}
