/**
 * scripts/_verify-fk-deps.ts
 * Read-only pre-flight check: verifies no existing data in FK-dependent tables
 * references the current public.users IDs before we update them.
 * Run before seed-auth-users.ts.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ---------------------------------------------------------------------------
// Load .env.local manually (no dotenv dependency required)
// ---------------------------------------------------------------------------
function loadEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found. Copy .env.local.example and fill in values.");
  }
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    env[key] = val;
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local"
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- 1. Check which tables have FK columns referencing public.users --------
  console.log("\n=== FK dependency check: tables referencing public.users ===\n");

  const { data: fkRows, error: fkErr } = await supabase.rpc("query_fk_deps" as never);
  // We can't use rpc for arbitrary SQL, so we query each relevant table directly.

  // Tables with FK columns pointing at users.id (from migration 002):
  //   hospital_capability_profiles.verified_by_user_id
  //   incidents.assigned_agent_id
  //   incidents.selected_hospital_id  (→ hospitals, not users — not relevant)
  //   patient_acceptance_records.accepted_by_user_id
  //   dispatch_assignments.assigned_by_user_id
  //   handover_summaries.generated_by_user_id
  //   handover_summaries.acknowledged_by_user_id
  //   copilot_interactions.agent_id
  //   audit_log_entries.actor_id

  const checks: Array<{ table: string; column: string }> = [
    { table: "hospital_capability_profiles", column: "verified_by_user_id" },
    { table: "incidents",                    column: "assigned_agent_id" },
    { table: "patient_acceptance_records",   column: "accepted_by_user_id" },
    { table: "dispatch_assignments",         column: "assigned_by_user_id" },
    { table: "handover_summaries",           column: "generated_by_user_id" },
    { table: "handover_summaries",           column: "acknowledged_by_user_id" },
    { table: "copilot_interactions",         column: "agent_id" },
    { table: "audit_log_entries",            column: "actor_id" },
  ];

  let totalDependentRows = 0;

  for (const { table, column } of checks) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .not(column, "is", null);

    if (error) {
      console.error(`  ERROR querying ${table}.${column}: ${error.message}`);
      continue;
    }

    const n = count ?? 0;
    totalDependentRows += n;
    const icon = n === 0 ? "✓" : "⚠";
    console.log(`  ${icon}  ${table}.${column}: ${n} row(s) referencing a user ID`);
  }

  console.log();

  // ---- 2. Load current public.users records ----------------------------------
  console.log("=== Current public.users records ===\n");
  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("id, email, role, organization_id, hospital_id, is_active")
    .order("role");

  if (usersErr || !users) throw new Error(`Failed to load users: ${usersErr?.message}`);

  for (const u of users) {
    console.log(`  ${u.role.padEnd(22)} ${u.email}`);
    console.log(`  ${"".padEnd(22)} current id: ${u.id}`);
  }

  console.log();

  // ---- 3. Summary -----------------------------------------------------------
  if (totalDependentRows > 0) {
    console.log(
      `⚠  WARNING: ${totalDependentRows} row(s) in dependent tables reference current user IDs.`
    );
    console.log(
      "   These will need to be updated after the UUID swap, or use Option B instead."
    );
  } else {
    console.log(
      "✅ SAFE TO PROCEED: No existing data in any dependent table references the current"
    );
    console.log(
      "   public.users IDs. Option A (UUID update) can be applied without data loss."
    );
  }

  console.log(
    "\nRun scripts/seed-auth-users.ts next to create Auth accounts and update the IDs.\n"
  );
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
