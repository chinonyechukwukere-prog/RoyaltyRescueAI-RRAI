/**
 * scripts/test-integration.ts
 * =============================================================================
 * End-to-end integration test for the RRAI MVP workflow.
 *
 * Tests the full emergency coordination workflow against the running Next.js
 * application (must be started separately on port 3000).
 *
 * SECURITY:
 * - Reads password from RRAI_SEED_PASSWORD env var — never printed or logged.
 * - Never prints access tokens, JWTs, service-role keys, or any secret.
 * - Reports only: test label, PASS/FAIL, user role, HTTP status, error messages.
 *
 * USAGE (two terminals):
 *   Terminal 1:  & "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" dev
 *   Terminal 2:  $env:RRAI_SEED_PASSWORD = "YourPassword"
 *                & "C:\Program Files\nodejs\node.exe" "node_modules\tsx\dist\cli.mjs" scripts/test-integration.ts
 *
 * COVERAGE:
 *   AC-01  Citizen intake — POST /api/incidents (public)
 *   AC-02  Consent gate
 *   AC-03  Agent login — POST /api/auth/login
 *   AC-04  401 on unauthenticated requests
 *   AC-05  Incident list visible to agent (org-scoped)
 *   AC-06  Incident detail
 *   AC-07  AI copilot dual-pass validation
 *   AC-08  Hospital registry
 *   AC-09  Patient acceptance
 *   AC-10  Ambulance dispatch
 *   AC-11  Handover summary
 *   AC-12  Audit log
 *   AC-13  Org admin login and admin API access
 *   AC-14  Role isolation — agent cannot access admin routes
 *   AC-15  Hospital admin login and capability profile update
 * =============================================================================
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const APP_PORT = parseInt(process.env.RRAI_TEST_PORT ?? "3000", 10);
const APP_HOST = "localhost";
const BASE_URL = `http://${APP_HOST}:${APP_PORT}`;

// ---------------------------------------------------------------------------
// Load .env.local (needed for org IDs only — no secrets printed)
// ---------------------------------------------------------------------------
function loadEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim().replace(/^\uFEFF/, "").replace(/\r$/, "");
    const val = t.slice(eq + 1).trim().replace(/\r$/, "");
    env[key] = val;
  }
  return env;
}

// ---------------------------------------------------------------------------
// HTTP helper — never logs body content containing tokens/keys
// ---------------------------------------------------------------------------
function appRequest(
  method: string,
  urlPath: string,
  body: unknown,
  bearerToken?: string
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts: http.RequestOptions = {
      hostname: APP_HOST,
      port: APP_PORT,
      path: urlPath,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };
    const req = http.request(opts, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: { _raw: raw } });
        }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;
let skipped = 0;
const failures: string[] = [];

function pass(label: string) {
  console.log(`  ✅ PASS  ${label}`);
  passed++;
}

function fail(label: string, detail?: string) {
  const msg = detail ? `${label} — ${detail}` : label;
  console.log(`  ❌ FAIL  ${msg}`);
  failed++;
  failures.push(msg);
}

function skip(label: string, reason: string) {
  console.log(`  ⏭  SKIP  ${label} (${reason})`);
  skipped++;
}

function check(label: string, cond: boolean, detail?: string) {
  if (cond) pass(label);
  else fail(label, detail);
}

function section(title: string) {
  console.log(`\n${"─".repeat(64)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(64));
}

// ---------------------------------------------------------------------------
// Redact helper — strips access tokens from error detail before printing
// ---------------------------------------------------------------------------
function safeDetail(body: Record<string, unknown>): string {
  const { error, message, code } = body as Record<string, string>;
  return [error, message, code].filter(Boolean).join(" | ") || "(no detail)";
}

// ---------------------------------------------------------------------------
// Main test suite
// ---------------------------------------------------------------------------
async function main() {
  const env = loadEnv();
  const password = process.env["RRAI_SEED_PASSWORD"];
  if (!password) {
    console.error(
      "\nFATAL: RRAI_SEED_PASSWORD environment variable not set.\n" +
      'Set it in your shell:  $env:RRAI_SEED_PASSWORD = "YourPassword"\n'
    );
    process.exit(1);
  }

  // Verify server is reachable
  try {
    await appRequest("GET", "/", null);
  } catch {
    console.error(
      "\nFATAL: Cannot connect to http://localhost:3000.\n" +
      "Start the Next.js dev server first:\n" +
      '  & "C:\\Program Files\\nodejs\\node.exe" "node_modules\\next\\dist\\bin\\next" dev\n'
    );
    process.exit(1);
  }

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║   RRAI Integration Test — MVP Workflow                       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");

  // ── AC-01/02: Citizen intake ───────────────────────────────────────────────
  section("AC-01/02 — Citizen Emergency Intake");

  const intakeRes = await appRequest("POST", "/api/incidents", {
    caller_name: "Synthetic Test Caller (RRAI Demo)",
    caller_phone: "+2348012345678",
    location_description: "12 Broad Street, Lagos Island",
    lga: "Lagos Island",
    emergency_type: "cardiac",
    presenting_complaint: "Severe chest pain radiating to left arm, difficulty breathing",
    persons_affected: 1,
    preferred_language: "en",
    consent_given: true,
  });
  check("AC-01 POST /api/incidents returns 201", intakeRes.status === 201, safeDetail(intakeRes.body));
  check("AC-01 Has incident_id", !!(intakeRes.body as {incident_id?:string}).incident_id);
  const ref = (intakeRes.body as {reference_number?:string}).reference_number ?? "";
  check("AC-01 Reference number format RRAI-YYYYMMDD-NNNN", /^RRAI-\d{8}-\d{4}$/.test(ref));
  const incidentId = (intakeRes.body as {incident_id?:string}).incident_id ?? "";
  if (incidentId) console.log(`       Reference: ${ref}  (ID: ${incidentId.slice(0, 8)}…)`);

  const noConsentRes = await appRequest("POST", "/api/incidents", {
    caller_name: "Test", caller_phone: "080", location_description: "Lagos",
    lga: "Ikeja", emergency_type: "trauma", presenting_complaint: "Pain",
    persons_affected: 1, preferred_language: "en", consent_given: false,
  });
  check("AC-02 Consent gate returns 400", noConsentRes.status === 400);
  check("AC-02 Error code = CONSENT_REQUIRED", (noConsentRes.body as {error?:string}).error === "CONSENT_REQUIRED");

  // ── AC-03/04: Authentication ──────────────────────────────────────────────
  section("AC-03/04 — Agent Authentication");

  const loginRes = await appRequest("POST", "/api/auth/login", {
    email: "emeka.agent@rapidresponse-ng.synthetic",
    password,  // never printed — only used in the Authorization header
  });
  check("AC-03 Login returns 200", loginRes.status === 200, safeDetail(loginRes.body));
  const agentRole = (loginRes.body as {user?: {role?:string}}).user?.role;
  const agentOrgId = (loginRes.body as {user?: {organization_id?:string}}).user?.organization_id;
  check("AC-03 Role = response_agent", agentRole === "response_agent", `got: ${agentRole}`);
  check("AC-03 organization_id present", !!agentOrgId);
  // Token extracted but never printed
  const agentToken: string = (loginRes.body as {access_token?: string}).access_token ?? "";
  check("AC-03 access_token issued", !!agentToken);

  const unauthRes = await appRequest("GET", "/api/incidents");
  check("AC-04 Unauthenticated GET /api/incidents → 401", unauthRes.status === 401);

  if (!agentToken) {
    console.log("\n  ⛔  Login failed — skipping all authenticated tests.");
    printSummary(); return;
  }

  // ── AC-13/14: Org admin login — runs early so adminToken is available
  //             for the hospital timestamp refresh before the copilot query ───
  section("AC-13/14 — Org Admin Login and Role Isolation");

  const adminLogin = await appRequest("POST", "/api/auth/login", {
    email: "adaeze.orgadmin@rapidresponse-ng.synthetic",
    password,
  });
  check("AC-13 Org admin login returns 200", adminLogin.status === 200, safeDetail(adminLogin.body));
  const adminRole = (adminLogin.body as {user?: {role?: string}}).user?.role;
  check("AC-13 Role = org_admin", adminRole === "org_admin", `got: ${adminRole}`);
  const adminToken: string = (adminLogin.body as {access_token?: string}).access_token ?? "";

  if (adminToken) {
    const adminRes = await appRequest("GET", "/api/admin/org", null, adminToken);
    check("AC-13 Org admin can access /api/admin/org", adminRes.status === 200, safeDetail(adminRes.body));

    check("AC-14 Agent token denied on /api/admin/org", [403, 401].includes(
      (await appRequest("GET", "/api/admin/org", null, agentToken)).status
    ));

    // Refresh hospital last_verified_at timestamps before the copilot query.
    // The seed data records timestamps at migration time; they expire after
    // outdated_threshold_hours (4h). This call resets them to NOW() on
    // confirmed hospitals only — unavailable/pending/outdated hospitals are
    // untouched and remain excluded (negative-path tests intact).
    const refreshRes = await appRequest(
      "POST", "/api/admin/refresh-hospital-timestamps", null, adminToken
    );
    if (refreshRes.status === 200) {
      console.log(`       Hospital timestamps refreshed: ${(refreshRes.body as {refreshed_count?: number}).refreshed_count ?? 0} profiles updated`);
    } else {
      console.log(`       ⚠ Hospital timestamp refresh failed (${refreshRes.status}) — copilot may return 0 eligible hospitals`);
    }
  } else {
    skip("AC-13 Admin API access", "admin login failed");
    skip("AC-14 Role isolation", "admin login failed");
  }

  // ── AC-05: Incident queue ─────────────────────────────────────────────────
  section("AC-05 — Agent Incident Queue (Org-scoped)");

  const listRes = await appRequest("GET", "/api/incidents", null, agentToken);
  check("AC-05 GET /api/incidents returns 200", listRes.status === 200, safeDetail(listRes.body));
  const incidents = (listRes.body as {incidents?: unknown[]}).incidents ?? [];
  check("AC-05 incidents is an array", Array.isArray(incidents));
  const hasNewIncident = (incidents as {id?:string}[]).some(i => i.id === incidentId);
  check("AC-05 New incident visible to org agent", hasNewIncident);
  console.log(`       Queue depth: ${incidents.length} incidents`);

  // ── AC-06: Incident detail ────────────────────────────────────────────────
  section("AC-06 — Incident Detail");

  if (!incidentId) { skip("AC-06", "no incident_id from AC-01"); }
  else {
    const detRes = await appRequest("GET", `/api/incidents/${incidentId}`, null, agentToken);
    check("AC-06 GET /api/incidents/:id returns 200", detRes.status === 200, safeDetail(detRes.body));
    const detId = (detRes.body as {incident?:{id?:string}; id?:string}).incident?.id ?? (detRes.body as {id?:string}).id;
    check("AC-06 Returns correct incident", detId === incidentId);
  }

  // ── AC-07: AI Copilot ─────────────────────────────────────────────────────
  section("AC-07 — AI Copilot Dual-Pass Validation");

  const copilotRes = await appRequest(
    "POST", "/api/copilot/query",
    { incident_id: incidentId, query_text: "Which hospitals can handle a cardiac emergency in Lagos Island?" },
    agentToken
  );
  check("AC-07 POST /api/copilot/query returns 200", copilotRes.status === 200, safeDetail(copilotRes.body));
  const recs = (copilotRes.body as {validated_recommendations?: unknown[]}).validated_recommendations ?? [];
  const excl = (copilotRes.body as {excluded_hospitals?: unknown[]}).excluded_hospitals ?? [];
  check("AC-07 validated_recommendations is array", Array.isArray(recs));
  check("AC-07 excluded_hospitals is array", Array.isArray(excl));
  check("AC-07 escalation_required is boolean",
    typeof (copilotRes.body as {escalation_required?: unknown}).escalation_required === "boolean");
  check("AC-07 All recommendations passed validation",
    (recs as {validation_passed?: boolean}[]).every(r => r.validation_passed === true));
  check("AC-07 No unavailable hospital in recommendations",
    (recs as {availability_status?: string}[]).every(r => r.availability_status === "confirmed"));
  const watsonxStatus = (copilotRes.body as {watsonx_status?: string}).watsonx_status;
  console.log(`       Eligible: ${recs.length}  Excluded: ${excl.length}  watsonx: ${watsonxStatus}`);

  // ── AC-08: Hospital registry ───────────────────────────────────────────────
  section("AC-08 — Hospital Registry");

  const hospRes = await appRequest("GET", "/api/hospitals", null, agentToken);
  check("AC-08 GET /api/hospitals returns 200", hospRes.status === 200, safeDetail(hospRes.body));
  const hospitals = (hospRes.body as {hospitals?: unknown[]}).hospitals ?? [];
  check("AC-08 hospitals is array", Array.isArray(hospitals));
  check("AC-08 Registry has hospitals", hospitals.length > 0, `count: ${hospitals.length}`);
  console.log(`       Registry size: ${hospitals.length} hospitals`);

  // ── AC-15: Hospital admin login (token needed for AC-09 acceptance) ────────
  section("AC-15 — Hospital Admin Login");

  // ngozi.admin is the hospital_admin for Sunrise Emergency Hospital (Synthetic).
  // Her hospital_id from the JWT will be matched against incident.selected_hospital_id
  // during the acceptance step, so she must be the admin for the hospital we select.
  const hospAdminLogin = await appRequest("POST", "/api/auth/login", {
    email: "ngozi.admin@sunrise-synthetic.ng",
    password,
  });
  check("AC-15 Hospital admin login returns 200", hospAdminLogin.status === 200, safeDetail(hospAdminLogin.body));
  const hospAdminRole = (hospAdminLogin.body as {user?: {role?: string}}).user?.role;
  const hospAdminHospitalId = (hospAdminLogin.body as {user?: {hospital_id?: string}}).user?.hospital_id;
  check("AC-15 Role = hospital_admin", hospAdminRole === "hospital_admin", `got: ${hospAdminRole}`);
  check("AC-15 hospital_id claim present", !!hospAdminHospitalId);
  const hospAdminToken: string = (hospAdminLogin.body as {access_token?: string}).access_token ?? "";

  // ── AC-09: Patient acceptance ─────────────────────────────────────────────
  // Prerequisite flow:
  //   1. Agent PATCHes incident to set selected_hospital_id + status=hospital_selected
  //   2. hospital_admin POSTs acceptance for that hospital
  // This mirrors the real workflow: agent selects hospital → hospital admin accepts.

  // The acceptance route validates hospital availability independently.
  // We use ngozi's hospital_id directly as the target regardless of whether
  // it appeared in copilot recommendations — this tests the full workflow.
  // Skip only if ngozi's login failed (no token or no hospital_id claim).
  if (!hospAdminToken || !hospAdminHospitalId) {
    skip("AC-09", "hospital admin login failed — no token or hospital_id claim");
    skip("AC-10", "depends on AC-09");
    skip("AC-11", "depends on AC-10");
  } else {
    // Step 1: agent selects the hospital on the incident (PATCH)
    // Use ngozi's hospital_id as the target — the acceptance check requires
    // incident.selected_hospital_id === auth.hospitalId of the accepting admin.
    const targetHospitalId = hospAdminHospitalId;
    section(`AC-09 — Agent Selects Hospital + Hospital Admin Accepts`);

    // Single PATCH: set both status and selected_hospital_id atomically.
    // The PATCH route accepts selected_hospital_id in the body (confirmed in route code).
    const patchRes = await appRequest(
      "PATCH", `/api/incidents/${incidentId}`,
      { status: "hospital_selected", selected_hospital_id: targetHospitalId },
      agentToken
    );
    check("AC-09 Agent PATCHes incident to hospital_selected", patchRes.status === 200, safeDetail(patchRes.body));

    if (patchRes.status !== 200) {
      skip("AC-09 Acceptance", "PATCH to hospital_selected failed");
      skip("AC-10", "depends on AC-09");
      skip("AC-11", "depends on AC-10");
    } else {
      const accRes = await appRequest(
        "POST", `/api/incidents/${incidentId}/acceptance`,
        { notes: "Synthetic test acceptance — RRAI competition prototype" },
        hospAdminToken   // ✅ hospital_admin token
      );
      check("AC-09 POST /acceptance returns 201", accRes.status === 201, safeDetail(accRes.body));
      // Route returns { acceptance: { id, accepted_at, operationally_valid } }
      const accRecord = (accRes.body as {acceptance?: {id?: string}}).acceptance;
      check("AC-09 acceptance.id present", !!accRecord?.id);

      if (accRes.status !== 201) {
        skip("AC-10", "acceptance failed");
        skip("AC-11", "depends on AC-10");
      } else {
        section("AC-10 — Ambulance Dispatch");

        const unitsRes = await appRequest("GET", `/api/incidents/${incidentId}/dispatch`, null, agentToken);
        check("AC-10 GET available units returns 200", unitsRes.status === 200);
        const units = (unitsRes.body as {units?: {id: string; unit_name: string; status: string}[]}).units ?? [];
        const availUnit = units.find(u => u.status === "available");

        if (!availUnit) {
          skip("AC-10 Dispatch", "no available ambulance units in org A");
          skip("AC-11", "depends on AC-10");
        } else {
          const dispRes = await appRequest(
            "POST", `/api/incidents/${incidentId}/dispatch`,
            { ambulance_unit_id: availUnit.id },
            agentToken
          );
          check("AC-10 POST /dispatch returns 201", dispRes.status === 201, safeDetail(dispRes.body));
          console.log(`       Unit: ${availUnit.unit_name}`);

          if (dispRes.status !== 201) {
            skip("AC-11", "dispatch failed");
          } else {
            section("AC-11 — Clinical Handover Summary");

            const hovRes = await appRequest(
              "POST", `/api/incidents/${incidentId}/handover`,
              { agent_notes: `Cardiac emergency. Transported by ${availUnit.unit_name}. Patient conscious, SpO2 94%.` },
              agentToken
            );
            check("AC-11 POST /handover returns 201", hovRes.status === 201, safeDetail(hovRes.body));
            // Route returns { handover: { id, generated_at } }
            const hovRecord = (hovRes.body as {handover?: {id?: string}}).handover;
            check("AC-11 handover.id present", !!hovRecord?.id);
          }
        }
      }
    }
  }

  // ── AC-12: Audit log ───────────────────────────────────────────────────────
  section("AC-12 — Incident Audit Log");

  const auditRes = await appRequest("GET", `/api/incidents/${incidentId}/audit`, null, agentToken);
  check("AC-12 GET /audit returns 200", auditRes.status === 200, safeDetail(auditRes.body));
  // Route returns { audit_entries: [...] } — not { entries: [...] }
  const entries = (auditRes.body as {audit_entries?: unknown[]}).audit_entries ?? [];
  check("AC-12 audit_entries is array", Array.isArray(entries));
  check("AC-12 incident_created entry present",
    (entries as {action_type?: string}[]).some(e => e.action_type === "incident_created"));
  console.log(`       Audit entries: ${entries.length}`);

  // ── Summary ────────────────────────────────────────────────────────────────
  printSummary();
}

function printSummary() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log(`║  RESULTS:  ${String(passed).padEnd(3)} passed   ${String(failed).padEnd(3)} failed   ${String(skipped).padEnd(3)} skipped          ║`);
  console.log("╚══════════════════════════════════════════════════════════════╝");
  if (failures.length > 0) {
    console.log("\nFailed checks:");
    for (const f of failures) console.log(`  • ${f}`);
  }
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
