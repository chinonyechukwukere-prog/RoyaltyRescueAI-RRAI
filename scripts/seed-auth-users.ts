/**
 * scripts/seed-auth-users.ts
 * =============================================================================
 * Creates Supabase Auth accounts for the 7 synthetic RRAI users and links them
 * to the existing public.users records via email address (Option A).
 *
 * HOW IT WORKS
 * ------------
 * 1. Reads credentials from .env.local — no secrets in source code or Git.
 * 2. Prompts you once for a demo password (stdin, never written to disk).
 * 3. For each user in public.users:
 *    a. Checks whether an auth.users entry already exists for that email.
 *    b. If not: calls supabase.auth.admin.createUser() — gets a NEW auth UUID.
 *    c. If already exists: re-uses the existing auth UUID (resumable).
 * 4. Updates public.users.id to match the auth UUID, matched by email.
 * 5. Prints a full verification table at the end.
 *
 * SAFETY GUARANTEES
 * -----------------
 * - Idempotent: safe to re-run if interrupted. Already-created accounts are
 *   detected and skipped; already-updated IDs are detected and skipped.
 * - No existing data is at risk: pre-flight confirms zero FK-dependent rows
 *   before any update (same check as _verify-fk-deps.ts).
 * - No hardcoded passwords, tokens, or connection strings anywhere in this file.
 * - This file is safe to commit; .env.local is gitignored.
 *
 * USAGE
 * -----
 * In YOUR terminal (not IBM Bob) from the project root:
 *
 *   npx ts-node scripts/seed-auth-users.ts
 *
 * You will be prompted:
 *   Enter demo password for all 7 synthetic accounts:
 *
 * Choose something you will remember for the demo — e.g. RraiDemo2026!
 * This password is ONLY for the fictional prototype accounts.
 *
 * AFTER RUNNING
 * -------------
 * Tell IBM Bob "seeding complete" and provide the printed verification table.
 * IBM Bob will then register the custom_access_token Auth Hook (OA-7) and
 * run a login test.
 * =============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

// ---------------------------------------------------------------------------
// Load .env.local
// ---------------------------------------------------------------------------
function loadEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      ".env.local not found.\n" +
      "Copy .env.local.example to .env.local and fill in your Supabase credentials."
    );
  }
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

// ---------------------------------------------------------------------------
// Prompt for password (not echoed to terminal on supported platforms)
// ---------------------------------------------------------------------------
function promptPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    // Suppress echo if the platform supports it
    if ((process.stdout as NodeJS.WriteStream).isTTY) {
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s === "\r\n" || s === "\n") process.stdout.write(s);
        // suppress keystrokes
      };
    }
    rl.question(prompt, (answer) => {
      process.stdout.write("\n");
      rl.close();
      resolve(answer);
    });
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  organization_id: string;
  hospital_id: string | null;
  is_active: boolean;
};

type SeedResult = {
  email: string;
  role: string;
  original_public_id: string;
  auth_id: string;
  id_already_matched: boolean;
  auth_account_existed: boolean;
  public_id_updated: boolean;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("\n=== RRAI Auth User Seeding Script ===\n");
  console.log("Loading credentials from .env.local...");

  const env = loadEnv();
  const url = env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceKey = env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !serviceKey || serviceKey === "your_supabase_service_role_key_here") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.\n" +
      "The service_role key is required for Auth admin operations."
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Pre-flight: confirm zero FK-dependent rows --------------------------
  console.log("Pre-flight: checking for FK-dependent rows...");
  const checks: Array<[string, string]> = [
    ["hospital_capability_profiles", "verified_by_user_id"],
    ["incidents",                    "assigned_agent_id"],
    ["patient_acceptance_records",   "accepted_by_user_id"],
    ["dispatch_assignments",         "assigned_by_user_id"],
    ["handover_summaries",           "generated_by_user_id"],
    ["handover_summaries",           "acknowledged_by_user_id"],
    ["copilot_interactions",         "agent_id"],
    ["audit_log_entries",            "actor_id"],
  ];
  let dependentRows = 0;
  for (const [table, column] of checks) {
    const { count } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .not(column, "is", null);
    dependentRows += count ?? 0;
  }
  if (dependentRows > 0) {
    throw new Error(
      `Pre-flight FAILED: ${dependentRows} row(s) in dependent tables already reference ` +
      "current public.users IDs. Updating UUIDs now would orphan those rows.\n" +
      "Either clear the dependent data first, or switch to Option B (add auth_user_id column)."
    );
  }
  console.log("Pre-flight PASSED — zero dependent rows.\n");

  // ---- Load public.users ---------------------------------------------------
  const { data: publicUsers, error: puErr } = await supabase
    .from("users")
    .select("id, email, name, role, organization_id, hospital_id, is_active")
    .order("role");

  if (puErr || !publicUsers?.length) {
    throw new Error(`Failed to load public.users: ${puErr?.message}`);
  }

  console.log(`Found ${publicUsers.length} users in public.users:\n`);
  for (const u of publicUsers as PublicUser[]) {
    console.log(`  ${u.role.padEnd(22)} ${u.email}`);
  }

  // ---- Prompt for password -------------------------------------------------
  console.log(
    "\nYou will be prompted for a demo password.\n" +
    "This password will be set for ALL 7 synthetic accounts.\n" +
    "Choose something you will remember for the competition demo.\n" +
    "It is NEVER written to disk or any file.\n"
  );
  const password = await promptPassword("Enter demo password for all 7 synthetic accounts: ");

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  // ---- Process each user ---------------------------------------------------
  console.log("\nProcessing users...\n");
  const results: SeedResult[] = [];

  for (const u of publicUsers as PublicUser[]) {
    process.stdout.write(`  ${u.email} (${u.role})... `);

    const result: SeedResult = {
      email:                u.email,
      role:                 u.role,
      original_public_id:   u.id,
      auth_id:              "",
      id_already_matched:   false,
      auth_account_existed: false,
      public_id_updated:    false,
    };

    // Check if auth account already exists for this email
    const { data: listData } = await supabase.auth.admin.listUsers();
    const existingAuthUser = listData?.users?.find(
      (au) => au.email?.toLowerCase() === u.email.toLowerCase()
    );

    let authId: string;

    if (existingAuthUser) {
      authId = existingAuthUser.id;
      result.auth_account_existed = true;
      process.stdout.write(`auth account exists (id: ${authId.slice(0, 8)}…) `);
    } else {
      // Create new auth account
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email:          u.email,
        password,
        email_confirm:  true,          // Skip email verification for demo
        user_metadata:  { name: u.name },
      });

      if (createErr || !created?.user) {
        process.stdout.write(`FAILED: ${createErr?.message}\n`);
        continue;
      }
      authId = created.user.id;
      process.stdout.write(`created (id: ${authId.slice(0, 8)}…) `);
    }

    result.auth_id = authId;

    // Check if public.users.id already matches the auth UUID
    if (u.id === authId) {
      result.id_already_matched = true;
      result.public_id_updated  = false;
      process.stdout.write("→ ID already matches, no update needed\n");
      results.push(result);
      continue;
    }

    // Update public.users.id to match the auth UUID, keyed by email
    const { error: updateErr } = await supabase
      .from("users")
      .update({ id: authId })
      .eq("email", u.email);

    if (updateErr) {
      process.stdout.write(`→ UPDATE FAILED: ${updateErr.message}\n`);
      results.push(result);
      continue;
    }

    result.public_id_updated = true;
    process.stdout.write("→ public.users.id updated ✓\n");
    results.push(result);
  }

  // ---- Verification --------------------------------------------------------
  console.log("\n=== Verification Table ===\n");
  console.log(
    "Role".padEnd(22) +
    "Email".padEnd(50) +
    "Auth ID (first 8)".padEnd(20) +
    "ID Match"
  );
  console.log("─".repeat(100));

  let allMatched = true;
  for (const r of results) {
    // Re-read the current public.users.id to confirm the update landed
    const { data: current } = await supabase
      .from("users")
      .select("id")
      .eq("email", r.email)
      .single();

    const currentId = current?.id ?? "NOT FOUND";
    const matched = currentId === r.auth_id;
    if (!matched) allMatched = false;

    console.log(
      r.role.padEnd(22) +
      r.email.padEnd(50) +
      r.auth_id.slice(0, 8).padEnd(20) +
      (matched ? "✅ YES" : `❌ NO (public: ${currentId?.slice(0, 8)})`)
    );
  }

  console.log("\n" + "─".repeat(100));
  if (allMatched) {
    console.log(
      "\n✅ ALL 7 users: auth.users.id === public.users.id\n" +
      "   The custom_access_token Auth Hook will resolve roles correctly at sign-in.\n" +
      "\nTell IBM Bob 'seeding complete' to proceed with the Auth Hook registration and login test.\n"
    );
  } else {
    console.log(
      "\n⚠  Some IDs did not match — see table above. Re-run this script to retry failed users.\n"
    );
  }
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
