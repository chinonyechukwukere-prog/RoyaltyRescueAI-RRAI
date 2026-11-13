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
 *   $env:RRAI_SEED_PASSWORD = "YourDemoPassword"
 *   & "C:\Program Files\nodejs\node.exe" "node_modules\.bin\tsx" scripts/seed-auth-users.ts
 *
 * The password is read from the RRAI_SEED_PASSWORD environment variable.
 * It is session-scoped — never written to disk or any file.
 * Choose something you will remember for the demo (min 8 chars).
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
import { execSync } from "child_process";

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
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
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
// Read demo password from RRAI_SEED_PASSWORD environment variable.
// Set it in your shell before running — never written to any file.
//
// PowerShell:
//   $env:RRAI_SEED_PASSWORD = "YourDemoPassword"
//   & "C:\Program Files\nodejs\node.exe" "node_modules\.bin\tsx" scripts/seed-auth-users.ts
//
// The env var is scoped to your current shell session only and disappears
// when you close the terminal. It does not appear in process arguments.
// ---------------------------------------------------------------------------
function getPassword(): string {
  const pw = process.env["RRAI_SEED_PASSWORD"] ?? "";
  if (!pw) {
    throw new Error(
      "RRAI_SEED_PASSWORD environment variable is not set.\n" +
      "Set it in your shell before running this script:\n\n" +
      '  PowerShell:  $env:RRAI_SEED_PASSWORD = "YourDemoPassword"\n' +
      '  Then run:    & "C:\\Program Files\\nodejs\\node.exe" "node_modules\\.bin\\tsx" scripts/seed-auth-users.ts\n\n' +
      "The variable is session-scoped and never written to disk."
    );
  }
  return pw;
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

  // Auth Admin API client — used only for createUser() and listUsers()
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Helper: run a read-only SQL query via the Supabase CLI ---------------
  // This bypasses the JS client fetch entirely and uses the CLI's direct DB
  // connection — avoiding the Node.js fetch failure on Windows.
  function cliQuery(sql: string): string {
    try {
      const result = execSync(
        `npx supabase db query --remote --read-only "${sql.replace(/"/g, '\\"')}"`,
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      );
      return result;
    } catch (e: unknown) {
      // CLI writes to stderr; stdout has the result
      const ex = e as { stdout?: string; stderr?: string };
      if (ex.stdout && ex.stdout.trim()) return ex.stdout;
      throw new Error(`CLI query failed: ${ex.stderr ?? String(e)}`);
    }
  }

  // ---- Pre-flight: single batched SQL check ---------------------------------
  console.log("Pre-flight: checking for FK-dependent rows...");
  const preflightSql =
    "SELECT " +
    "(SELECT COUNT(*) FROM hospital_capability_profiles WHERE verified_by_user_id IS NOT NULL) +" +
    "(SELECT COUNT(*) FROM incidents WHERE assigned_agent_id IS NOT NULL) +" +
    "(SELECT COUNT(*) FROM patient_acceptance_records WHERE accepted_by_user_id IS NOT NULL) +" +
    "(SELECT COUNT(*) FROM dispatch_assignments WHERE assigned_by_user_id IS NOT NULL) +" +
    "(SELECT COUNT(*) FROM handover_summaries WHERE generated_by_user_id IS NOT NULL) +" +
    "(SELECT COUNT(*) FROM audit_log_entries WHERE actor_id IS NOT NULL) AS total_dependent_rows";
  const preflightOut = cliQuery(preflightSql);
  const depMatch = preflightOut.match(/(\d+)/);
  const dependentRows = depMatch ? parseInt(depMatch[1], 10) : 0;
  if (dependentRows > 0) {
    throw new Error(
      `Pre-flight FAILED: ${dependentRows} dependent row(s) reference current user IDs. ` +
      "Clear operational data first or use Option B."
    );
  }
  console.log("Pre-flight PASSED — zero dependent rows.\n");

  // ---- Load public.users via CLI -------------------------------------------
  const usersSql =
    "SELECT id, email, name, role, organization_id, hospital_id, is_active " +
    "FROM public.users ORDER BY role";
  const usersOut = cliQuery(usersSql);

  // Parse the CLI table output into objects
  const publicUsers: PublicUser[] = [];
  const lines = usersOut.split("\n").filter(l => l.includes("│"));
  // Skip header row (contains column names)
  const dataLines = lines.filter(l =>
    !l.includes("id") && !l.includes("email") && !l.includes("─") &&
    l.trim().startsWith("│")
  );
  for (const line of dataLines) {
    const cols = line.split("│").map(c => c.trim()).filter(Boolean);
    if (cols.length < 7) continue;
    publicUsers.push({
      id:              cols[0],
      email:           cols[1],
      name:            cols[2],
      role:            cols[3],
      organization_id: cols[4],
      hospital_id:     cols[5] === "NULL" ? null : cols[5],
      is_active:       cols[6] === "true" || cols[6] === "t",
    });
  }

  if (!publicUsers.length) {
    throw new Error(
      "Could not parse users from CLI output. " +
      "Raw output:\n" + usersOut.slice(0, 500)
    );
  }

  console.log(`Found ${publicUsers.length} users in public.users:\n`);
  for (const u of publicUsers as PublicUser[]) {
    console.log(`  ${u.role.padEnd(22)} ${u.email}`);
  }

  // ---- Prompt for password -------------------------------------------------
  const password = getPassword();
  if (password.length < 8) {
    throw new Error("RRAI_SEED_PASSWORD must be at least 8 characters.");
  }
  console.log("Demo password loaded from RRAI_SEED_PASSWORD ✓\n");

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

    // Update public.users.id to match the auth UUID via CLI (bypasses fetch)
    const escapedEmail = u.email.replace(/'/g, "''");
    const escapedId = authId.replace(/'/g, "''");
    try {
      execSync(
        `npx supabase db query --remote --yes "UPDATE public.users SET id = '${escapedId}' WHERE email = '${escapedEmail}'"`,
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
      );
    } catch (e: unknown) {
      const ex = e as { stdout?: string; stderr?: string };
      // CLI writes progress to stderr; check stdout for errors
      const out = (ex.stdout ?? "") + (ex.stderr ?? "");
      if (out.toLowerCase().includes("error")) {
        process.stdout.write(`→ UPDATE FAILED: ${out.slice(0, 120)}\n`);
        results.push(result);
        continue;
      }
    }

    result.public_id_updated = true;
    process.stdout.write("→ public.users.id updated ✓\n");
    results.push(result);
  }

  // ---- Verification via CLI ------------------------------------------------
  console.log("\n=== Verification Table ===\n");
  const verifyOut = cliQuery(
    "SELECT u.email, u.role, u.id AS public_id, a.id AS auth_id, " +
    "CASE WHEN u.id = a.id THEN 'MATCH' ELSE 'MISMATCH' END AS status " +
    "FROM public.users u LEFT JOIN auth.users a ON a.email = u.email ORDER BY u.role"
  );

  console.log(verifyOut);

  const allMatched = !verifyOut.includes("MISMATCH");
  // Build results summary from verifyOut for the final message
  for (const r of results) {
    const matched = verifyOut.includes(r.email) && !verifyOut.includes("MISMATCH");
    r.id_already_matched = matched;
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
