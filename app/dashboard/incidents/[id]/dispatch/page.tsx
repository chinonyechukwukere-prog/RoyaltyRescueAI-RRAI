"use client";

/**
 * Dispatch Panel — /dashboard/incidents/[id]/dispatch
 * F7: Agent assigns ambulance unit; advance status to en_route / arrived.
 * PRD F7, MVP AC-11
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Unit = { id: string; unit_name: string; status: string; is_synthetic: boolean };

export default function DispatchPage() {
  const { id } = useParams<{ id: string }>();
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState("");
  const [loading, setLoading] = useState(true);
  const [dispatching, setDispatching] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [dispatchStatus, setDispatchStatus] = useState<string | null>(null);

  function token() { return sessionStorage.getItem("rrai_token") ?? ""; }

  useEffect(() => {
    fetch(`/api/incidents/${id}/dispatch`, { headers: { Authorization: `Bearer ${token()}` } })
      .then((r) => r.json())
      .then((j) => setUnits(j.units ?? []))
      .catch(() => setMsg({ type: "error", text: "Failed to load ambulance units." }))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDispatch() {
    if (!selectedUnit) return;
    setDispatching(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/incidents/${id}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ ambulance_unit_id: selectedUnit }),
      });
      const j = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: j.message ?? j.error ?? "Dispatch failed." });
        return;
      }
      setDispatchStatus("dispatched");
      setMsg({ type: "success", text: "Ambulance dispatched successfully." });
      setUnits((prev) => prev.map((u) => u.id === selectedUnit ? { ...u, status: "dispatched" } : u));
    } catch {
      setMsg({ type: "error", text: "Network error. Please try again." });
    } finally {
      setDispatching(false);
    }
  }

  async function handleAdvance(status: "en_route" | "arrived") {
    setAdvancing(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/incidents/${id}/dispatch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ status }),
      });
      const j = await res.json();
      if (!res.ok) { setMsg({ type: "error", text: j.message ?? "Update failed." }); return; }
      setDispatchStatus(status);
      setMsg({ type: "success", text: `Status advanced to '${status.replace("_", " ")}'.` });
    } catch {
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setAdvancing(false);
    }
  }

  const availableUnits = units.filter((u) => u.status === "available");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href={`/dashboard/incidents/${id}`} className="text-primary hover:underline">← Incident</Link>
        <span className="text-muted-foreground">/</span>
        <span>Dispatch</span>
      </div>

      <div className="rounded-xl border border-border bg-white p-6 max-w-xl space-y-5">
        <div>
          <h1 className="text-lg font-bold text-foreground mb-1">Ambulance Dispatch</h1>
          <p className="text-sm text-muted-foreground">
            Patient acceptance must be confirmed before dispatch proceeds. Select an available unit and confirm.
          </p>
        </div>

        {msg && (
          <div role="alert" className={`rounded-md border px-4 py-3 text-sm ${
            msg.type === "success" ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"
          }`}>
            {msg.text}
          </div>
        )}

        {loading && <p className="text-sm text-muted-foreground">Loading units…</p>}

        {!loading && !dispatchStatus && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Select Ambulance Unit</label>
              {availableUnits.length === 0 ? (
                <p className="text-sm text-muted-foreground">No available units at this time.</p>
              ) : (
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">— Select a unit —</option>
                  {availableUnits.map((u) => (
                    <option key={u.id} value={u.id}>{u.unit_name}{u.is_synthetic ? " (synthetic)" : ""}</option>
                  ))}
                </select>
              )}
            </div>
            <button
              onClick={handleDispatch}
              disabled={!selectedUnit || dispatching}
              className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {dispatching ? "Dispatching…" : "Confirm Dispatch"}
            </button>
          </div>
        )}

        {dispatchStatus && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">
              Current status: <span className="capitalize font-semibold">{dispatchStatus.replace("_", " ")}</span>
            </p>
            <div className="flex gap-2">
              {dispatchStatus === "dispatched" && (
                <button
                  onClick={() => handleAdvance("en_route")}
                  disabled={advancing}
                  className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-secondary/40 disabled:opacity-50"
                >
                  Mark En Route
                </button>
              )}
              {dispatchStatus === "en_route" && (
                <button
                  onClick={() => handleAdvance("arrived")}
                  disabled={advancing}
                  className="rounded-lg border border-border px-4 py-2 text-sm transition hover:bg-secondary/40 disabled:opacity-50"
                >
                  Mark Arrived
                </button>
              )}
              {dispatchStatus === "arrived" && (
                <p className="text-sm text-green-700 font-medium">✓ Ambulance has arrived.</p>
              )}
            </div>
          </div>
        )}

        {/* All units table */}
        {!loading && units.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">All Units</h2>
            <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
              <thead className="bg-secondary/40 text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 text-left">Unit</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {units.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2">{u.unit_name}</td>
                    <td className="px-3 py-2 capitalize">{u.status}</td>
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
