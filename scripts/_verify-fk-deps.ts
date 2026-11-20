/**
 * scripts/_verify-fk-deps.ts
 * =============================================================================
 * Read-only pre-flight check: verifies no existing data in FK-dependent tables
 * references the current public.users IDs before we update them.
 * Run before seed-auth-users.ts.
 *
 * Uses the Supabase CLI for all DB reads to avoid the supabase-js fetch()
 * failures on Windows (Node.js v24 + IPv6/DNS). No REST API calls are made.
 *
 * USAGE
 * -----
 *   & "C:\Program Files\nodejs\node.exe" "node_modules\tsx\dist\cli.mjs" scripts/_verify-fk-deps.ts
 * =============================================================================
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ---------------------------------------------------------------------------
// Absolute invocation paths — avoids PowerShell execution-policy blocks
// ---------------------------------------------------------------------------
const NODE    = "C:\\Program Files\\nodejs\\node.exe";
const NPX_CLI = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js";

// ---------------------------------------------------------------------------
// Load .env.local (needed only to verify the file exists; CLI uses its own
// linked project config — but we confirm credentials are present).
// ---------------------------------------------------------------------------
function loadEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found. Copy .env.local.example and fill in values.");
  }
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
// CLI query helper (read-only)
// ---------------------------------------------------------------------------
function cliQuery(sql: string): string {
  const cmd = `"${NODE}" "${NPX_CLI}" supabase db query --remote --read-only "${sql.replace(/"/g, '\\"')}"`;
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: unknown) {
    const ex = e as { stdout?: string; stderr?: string };
    if (ex.stdout && ex.stdout.trim()) return ex.stdout;
    throw new Error(`CLI query failed.\nSQL: ${sql}\nSTDERR: ${ex.stderr ?? String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Parse box-drawing CLI table into rows of string cells.
// Header row (first content row) is skipped; returns data rows only.
// ---------------------------------------------------------------------------
const BOX_BORDER_RE = /[┌┐└┘├┤┬┴┼─]/u;

function parseCliTable(output: string): string[][] {
  const rows: string[][] = [];
  for (const line of output.split("\n")) {
    if (!line.includes("│")) continue;
    if (BOX_BORDER_RE.test(line)) continue;
    const cols = line.split("│").map(c => c.trim());
    const cells = cols.filter((c, i) => !(i === 0 && c === "") && !(i === cols.length - 1 && c === ""));
    if (cells.length === 0) continue;
    rows.push(cells);
  }
  return rows.slice(1); // skip header row
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("\n=== RRAI FK Dependency Pre-flight Check ===\n");

  const env = loadEnv();
  if (!env["NEXT_PUBLIC_SUPABASE_URL"] || !env["SUPABASE_SERVICE_ROLE_KEY"]) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local"
    );
  }
  console.log("Credentials found in .env.local ✓\n");

  // ---- 1. Per-table FK counts -----------------------------------------------
  // Tables with FK columns pointing at users.id (from migration 002):
  const checks: Array<{ table: string; column: string }> = [
    { table: "hospital_capability_profiles", column: "verified_by_user_id"   },
    { table: "incidents",                    column: "assigned_agent_id"      },
    { table: "patient_acceptance_records",   column: "accepted_by_user_id"    },
    { table: "dispatch_assignments",         column: "assigned_by_user_id"    },
    { table: "handover_summaries",           column: "generated_by_user_id"   },
    { table: "handover_summaries",           column: "acknowledged_by_user_id"},
    { table: "copilot_interactions",         column: "agent_id"               },
    { table: "audit_log_entries",            column: "actor_id"               },
  ];

  console.log("=== FK dependency check: tables referencing public.users ===\n");

  let totalDependentRows = 0;

  for (const { table, column } of checks) {
    const sql =
      `SELECT COUNT(*) AS cnt FROM public.${table} WHERE ${column} IS NOT NULL`;
    try {
      const out = cliQuery(sql);
      const rows = parseCliTable(out);
      const n = rows.length > 0 ? parseInt(rows[0][0] ?? "0", 10) : 0;
      totalDependentRows += isNaN(n) ? 0 : n;
      const icon = n === 0 ? "✓" : "⚠";
      console.log(`  ${icon}  ${table}.${column}: ${n} row(s)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗  ${table}.${column}: ERROR — ${msg.slice(0, 120)}`);
    }
  }

  console.log();

  // ---- 2. Current public.users records --------------------------------------
  console.log("=== Current public.users records ===\n");
  const usersOut = cliQuery(
    "SELECT id, email, role, is_active FROM public.users ORDER BY role"
  );
  const userRows = parseCliTable(usersOut);

  if (!userRows.length) {
    console.warn("  (no rows returned — check CLI connectivity)\n");
  } else {
    for (const cols of userRows) {
      if (cols.length < 3) continue;
      console.log(`  ${cols[2].padEnd(22)} ${cols[1]}`);
      console.log(`  ${"".padEnd(22)} current id: ${cols[0]}`);
    }
  }

  console.log();

  // ---- 3. Summary -----------------------------------------------------------
  if (totalDependentRows > 0) {
    console.log(
      `⚠  WARNING: ${totalDependentRows} row(s) in dependent tables reference current user IDs.\n` +
      "   These will need to be cleared or migrated after the UUID swap."
    );
  } else {
    console.log(
      "✅ SAFE TO PROCEED: No existing data in any dependent table references the\n" +
      "   current public.users IDs. Option A (UUID update) can be applied safely."
    );
  }

  console.log(
    "\nRun scripts/seed-auth-users.ts to create Auth accounts and update the IDs.\n"
  );
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
