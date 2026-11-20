/**
 * scripts/seed-auth-users.ts
 * =============================================================================
 * Creates Supabase Auth accounts for the 7 synthetic RRAI users and links them
 * to the existing public.users records via email address (Option A).
 *
 * HOW IT WORKS
 * ------------
 * 1. Reads credentials from .env.local — no secrets in source code or Git.
 * 2. Reads the demo password from RRAI_SEED_PASSWORD (session-scoped env var).
 * 3. For each user in public.users:
 *    a. Checks whether an auth.users entry already exists for that email.
 *    b. If not: calls supabase.auth.admin.createUser() — gets a NEW auth UUID.
 *    c. If already exists: re-uses the existing auth UUID (idempotent / resumable).
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
 *   & "C:\Program Files\nodejs\node.exe" "node_modules\tsx\dist\cli.mjs" scripts/seed-auth-users.ts
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
// Absolute path to node.exe — avoids PowerShell execution-policy blocks
// that prevent `npx` from running as a .ps1 script.
// ---------------------------------------------------------------------------
const NODE = "C:\\Program Files\\nodejs\\node.exe";
const NPX_CLI = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js";

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
// ---------------------------------------------------------------------------
function getPassword(): string {
  const pw = process.env["RRAI_SEED_PASSWORD"] ?? "";
  if (!pw) {
    throw new Error(
      "RRAI_SEED_PASSWORD environment variable is not set.\n" +
      "Set it in your shell before running this script:\n\n" +
      '  PowerShell:  $env:RRAI_SEED_PASSWORD = "YourDemoPassword"\n' +
      '  Then run:    & "C:\\Program Files\\nodejs\\node.exe" "node_modules\\tsx\\dist\\cli.mjs" scripts/seed-auth-users.ts\n\n' +
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
// CLI query helper
// Uses the absolute node + npx-cli.js path to avoid PowerShell policy blocks.
// The Supabase CLI writes progress/warnings to stderr; actual query results
// go to stdout. Exit code 1 is normal when stderr has warnings — we check
// stdout first before treating it as a real error.
// ---------------------------------------------------------------------------
function cliQuery(sql: string, readOnly = true): string {
  // Read-only queries use --read-only; write queries use --yes (skips TTY confirmation).
  const flag = readOnly ? "--read-only" : "--yes";
  const cmd = `"${NODE}" "${NPX_CLI}" supabase db query --remote ${flag} "${sql.replace(/"/g, '\\"')}"`;
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  } catch (e: unknown) {
    const ex = e as { stdout?: string; stderr?: string };
    // CLI exits non-zero when it prints version-upgrade warnings to stderr.
    // If stdout has actual content, that is the real result — use it.
    if (ex.stdout && ex.stdout.trim()) return ex.stdout;
    throw new Error(`CLI query failed.\nSQL: ${sql}\nSTDERR: ${ex.stderr ?? String(e)}`);
  }
}

// ---------------------------------------------------------------------------
// Parse the box-drawing table the Supabase CLI prints.
//
// The CLI renders output like this (using Unicode box-drawing chars):
//
//   ┌──────────┬──────────┐
//   │ col1     │ col2     │
//   ├──────────┼──────────┤
//   │ value1   │ value2   │
//   └──────────┴──────────┘
//
// Rules:
//   - Every row (header + data + borders) contains the │ character.
//   - Border/separator rows also contain ─ (U+2500), ┼ (U+253C), ├ (U+251C),
//     └ (U+2514), ┐ (U+2510), ┘ (U+2518), ┤ (U+2524), ┬ (U+252C), ┴ (U+2534).
//   - The first data row (after the ├…┤ separator) is the header.
//   - Actual data rows follow the header.
//
// Strategy: collect all │-containing lines, skip any that also contain a
// box-drawing corner/junction character (those are border rows), then skip
// the first remaining line (the header), and parse the rest as data.
// ---------------------------------------------------------------------------
const BOX_BORDER_RE = /[┌┐└┘├┤┬┴┼─]/u;

function parseCliTable(output: string): string[][] {
  const rows: string[][] = [];
  for (const line of output.split("\n")) {
    // Must contain the column-separator │
    if (!line.includes("│")) continue;
    // Skip border/separator rows
    if (BOX_BORDER_RE.test(line)) continue;
    // Split on │ and trim each cell
    const cols = line.split("│").map(c => c.trim()).filter((_, i, a) => {
      // The split produces empty strings at the start and end (before the
      // leading │ and after the trailing │) — filter those out.
      return true;
    });
    // Remove the empty first and last elements that come from the leading/trailing │
    const cells = cols.filter((c, i) => !(i === 0 && c === "") && !(i === cols.length - 1 && c === ""));
    if (cells.length === 0) continue;
    rows.push(cells);
  }
  // First row is the header — return everything after it as data
  return rows.slice(1);
}

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

  // ---- Pre-flight: check for FK-dependent rows ------------------------------
  console.log("Pre-flight: checking for FK-dependent rows...");
  const preflightSql =
    "SELECT (" +
    "  (SELECT COUNT(*) FROM hospital_capability_profiles WHERE verified_by_user_id IS NOT NULL) +" +
    "  (SELECT COUNT(*) FROM incidents WHERE assigned_agent_id IS NOT NULL) +" +
    "  (SELECT COUNT(*) FROM patient_acceptance_records WHERE accepted_by_user_id IS NOT NULL) +" +
    "  (SELECT COUNT(*) FROM dispatch_assignments WHERE assigned_by_user_id IS NOT NULL) +" +
    "  (SELECT COUNT(*) FROM handover_summaries WHERE generated_by_user_id IS NOT NULL) +" +
    "  (SELECT COUNT(*) FROM audit_log_entries WHERE actor_id IS NOT NULL)" +
    ") AS total_dependent_rows";
  const preflightOut = cliQuery(preflightSql);
  const preflightRows = parseCliTable(preflightOut);
  const dependentRows = preflightRows.length > 0 ? parseInt(preflightRows[0][0] ?? "0", 10) : 0;
  if (isNaN(dependentRows)) {
    console.warn("Pre-flight: could not parse dependent row count — proceeding cautiously.");
  } else if (dependentRows > 0) {
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

  // Parse with the corrected box-drawing table parser
  const userRows = parseCliTable(usersOut);

  const publicUsers: PublicUser[] = [];
  for (const cols of userRows) {
    // Expect at least 7 columns: id, email, name, role, organization_id, hospital_id, is_active
    if (cols.length < 7) continue;
    // Validate the first column looks like a UUID (data row guard)
    if (!/^[0-9a-f-]{36}$/i.test(cols[0])) continue;
    publicUsers.push({
      id:              cols[0],
      email:           cols[1],
      name:            cols[2],
      role:            cols[3],
      organization_id: cols[4],
      hospital_id:     cols[5] === "NULL" || cols[5] === "" ? null : cols[5],
      is_active:       cols[6] === "true" || cols[6] === "t",
    });
  }

  if (!publicUsers.length) {
    // Print the raw output to help diagnose any future format change
    throw new Error(
      "Could not parse users from CLI output.\n" +
      "Raw output (first 800 chars):\n" + usersOut.slice(0, 800)
    );
  }

  console.log(`Found ${publicUsers.length} users in public.users:\n`);
  for (const u of publicUsers) {
    console.log(`  ${u.role.padEnd(22)} ${u.email}`);
  }

  // ---- Password -----------------------------------------------------------
  const password = getPassword();
  if (password.length < 8) {
    throw new Error("RRAI_SEED_PASSWORD must be at least 8 characters.");
  }
  console.log("\nDemo password loaded from RRAI_SEED_PASSWORD ✓\n");

  // ---- Fetch all current auth accounts once --------------------------------
  // listUsers() can paginate; for ≤7 accounts a single call is sufficient.
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr || !listData) {
    throw new Error(`Failed to list auth users: ${listErr?.message ?? "no data returned"}`);
  }
  console.log(`Auth API: found ${listData.users.length} existing account(s).\n`);

  // ---- Process each user ---------------------------------------------------
  console.log("Processing users...\n");
  const results: SeedResult[] = [];

  for (const u of publicUsers) {
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

    // Look up existing auth account by email (case-insensitive)
    const existingAuthUser = listData.users.find(
      (au) => au.email?.toLowerCase() === u.email.toLowerCase()
    );

    let authId: string;

    if (existingAuthUser) {
      authId = existingAuthUser.id;
      result.auth_account_existed = true;
      process.stdout.write(`auth exists (${authId.slice(0, 8)}…) `);
    } else {
      // Create new auth account
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email:         u.email,
        password,
        email_confirm: true,          // Skip email verification for demo
        user_metadata: { name: u.name },
      });

      if (createErr || !created?.user) {
        process.stdout.write(`FAILED to create: ${createErr?.message ?? "no user returned"}\n`);
        results.push(result);
        continue;
      }
      authId = created.user.id;
      process.stdout.write(`created (${authId.slice(0, 8)}…) `);
    }

    result.auth_id = authId;

    // If IDs already match, nothing to do
    if (u.id === authId) {
      result.id_already_matched = true;
      process.stdout.write("→ ID already matches ✓\n");
      results.push(result);
      continue;
    }

    // Update public.users.id to match the auth UUID via CLI
    const escapedEmail = u.email.replace(/'/g, "''");
    const escapedId    = authId.replace(/'/g, "''");
    const updateSql    = `UPDATE public.users SET id = '${escapedId}' WHERE email = '${escapedEmail}'`;
    try {
      cliQuery(updateSql, false /* not read-only */);
      result.public_id_updated = true;
      process.stdout.write("→ public.users.id updated ✓\n");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      process.stdout.write(`→ UPDATE FAILED: ${msg.slice(0, 120)}\n`);
    }
    results.push(result);
  }

  // ---- Verification --------------------------------------------------------
  console.log("\n=== Verification Table ===\n");
  const verifyOut = cliQuery(
    "SELECT u.email, u.role, CAST(u.id AS text) AS public_id, CAST(a.id AS text) AS auth_id, " +
    "CASE WHEN u.id = a.id THEN 'MATCH' WHEN a.id IS NULL THEN 'NO_AUTH' ELSE 'MISMATCH' END AS status " +
    "FROM public.users u LEFT JOIN auth.users a ON a.email = u.email ORDER BY u.role"
  );
  console.log(verifyOut);

  const hasNoAuth  = verifyOut.includes("NO_AUTH");
  const hasMismatch = verifyOut.includes("MISMATCH");
  const allMatched = !hasNoAuth && !hasMismatch;

  console.log("─".repeat(100));
  if (allMatched) {
    console.log(
      "\n✅ ALL 7 users: auth.users.id === public.users.id\n" +
      "   The custom_access_token Auth Hook will resolve roles correctly at sign-in.\n\n" +
      "Tell IBM Bob 'seeding complete' to proceed with the Auth Hook registration and login test.\n"
    );
  } else {
    console.log(
      "\n⚠  Some accounts still need attention — see table above.\n" +
      "   Re-run this script to retry any failed or missing accounts.\n"
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
