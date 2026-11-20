/**
 * scripts/reset-auth-passwords.ts
 * =============================================================================
 * Resets the password for all 7 existing RRAI demo auth accounts to a single
 * new password supplied via the RRAI_SEED_PASSWORD environment variable.
 *
 * WHAT THIS SCRIPT DOES
 * ---------------------
 * 1. Reads credentials from .env.local — no secrets in source code or Git.
 * 2. Reads the new password from RRAI_SEED_PASSWORD (session-scoped env var).
 * 3. Fetches the 7 emails from public.users via Supabase CLI (read-only).
 * 4. Calls supabase.auth.admin.listUsers() to get live auth account IDs.
 * 5. For each matching account: calls supabase.auth.admin.updateUserById()
 *    with { password } only — no other fields touched.
 * 6. Prints a result table showing RESET ✓ or FAILED for each account.
 *
 * WHAT THIS SCRIPT DOES NOT DO
 * ----------------------------
 * - Does NOT recreate any auth account.
 * - Does NOT change any user UUID (auth or public.users).
 * - Does NOT write to public.users or any other DB table.
 * - Does NOT send any email to any user.
 * - Does NOT modify any other file.
 *
 * USAGE
 * -----
 * In YOUR terminal (not IBM Bob) from the project root:
 *
 *   $env:RRAI_SEED_PASSWORD = "YourNewDemoPassword123"
 *   & "C:\Program Files\nodejs\node.exe" "node_modules\tsx\dist\cli.mjs" scripts/reset-auth-passwords.ts
 *
 * The password is read from RRAI_SEED_PASSWORD — session-scoped, never written
 * to disk. Minimum 8 characters. Safe to re-run if any single account fails.
 *
 * AFTER RUNNING
 * -------------
 * Tell IBM Bob "passwords reset" and provide the printed result table.
 * IBM Bob will then proceed with the Auth Hook registration and login test.
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
// Read new password from RRAI_SEED_PASSWORD environment variable.
// ---------------------------------------------------------------------------
function getPassword(): string {
  const pw = process.env["RRAI_SEED_PASSWORD"] ?? "";
  if (!pw) {
    throw new Error(
      "RRAI_SEED_PASSWORD environment variable is not set.\n" +
      "Set it in your shell before running this script:\n\n" +
      '  PowerShell:  $env:RRAI_SEED_PASSWORD = "YourNewDemoPassword123"\n' +
      '  Then run:    & "C:\\Program Files\\nodejs\\node.exe" "node_modules\\tsx\\dist\\cli.mjs" scripts/reset-auth-passwords.ts\n\n' +
      "The variable is session-scoped and never written to disk."
    );
  }
  if (pw.length < 8) {
    throw new Error("RRAI_SEED_PASSWORD must be at least 8 characters.");
  }
  return pw;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("\n=== RRAI Auth Password Reset Script ===\n");
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

  const password = getPassword();
  console.log("New password loaded from RRAI_SEED_PASSWORD ✓\n");

  // Admin API client — service_role key; used only for listUsers() + updateUserById()
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---- Fetch emails from public.users via CLI (read-only) -------------------
  console.log("Fetching user list from public.users via CLI...");
  const usersSql = "SELECT email, role FROM public.users ORDER BY role";
  let usersOut: string;
  try {
    usersOut = execSync(
      `npx supabase db query --remote --read-only "${usersSql}"`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
    );
  } catch (e: unknown) {
    const ex = e as { stdout?: string; stderr?: string };
    if (ex.stdout && ex.stdout.trim()) {
      usersOut = ex.stdout;
    } else {
      throw new Error(`CLI query failed: ${ex.stderr ?? String(e)}`);
    }
  }

  // Parse email + role from CLI table output
  const publicEmails: { email: string; role: string }[] = [];
  for (const line of usersOut.split("\n")) {
    if (!line.includes("│")) continue;
    const cols = line.split("│").map(c => c.trim()).filter(Boolean);
    if (cols.length < 2) continue;
    // Skip header row
    if (cols[0] === "email" || cols[0] === "─".repeat(cols[0].length)) continue;
    if (!cols[0].includes("@")) continue;
    publicEmails.push({ email: cols[0], role: cols[1] });
  }

  if (!publicEmails.length) {
    throw new Error(
      "Could not parse emails from CLI output.\nRaw output:\n" + usersOut.slice(0, 500)
    );
  }
  console.log(`Found ${publicEmails.length} emails in public.users.\n`);

  // ---- Fetch all auth accounts once ----------------------------------------
  console.log("Fetching auth accounts via Admin API...");
  const { data: listData, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr || !listData) {
    throw new Error(`Failed to list auth users: ${listErr?.message ?? "no data returned"}`);
  }
  console.log(`Found ${listData.users.length} accounts in auth.users.\n`);

  // ---- Reset password for each user ----------------------------------------
  console.log("Resetting passwords...\n");

  type ResetResult = { email: string; role: string; authId: string; status: string };
  const results: ResetResult[] = [];

  for (const { email, role } of publicEmails) {
    process.stdout.write(`  ${email.padEnd(42)} (${role})... `);

    const authUser = listData.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!authUser) {
      process.stdout.write("NO AUTH ACCOUNT FOUND — skipped\n");
      results.push({ email, role, authId: "—", status: "NO ACCOUNT" });
      continue;
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(
      authUser.id,
      { password }         // only password — no other fields
    );

    if (updateErr) {
      process.stdout.write(`FAILED: ${updateErr.message}\n`);
      results.push({ email, role, authId: authUser.id.slice(0, 8) + "…", status: "FAILED" });
    } else {
      process.stdout.write("RESET ✓\n");
      results.push({ email, role, authId: authUser.id.slice(0, 8) + "…", status: "RESET ✓" });
    }
  }

  // ---- Summary table -------------------------------------------------------
  console.log("\n" + "─".repeat(80));
  console.log("\n=== Result Summary ===\n");
  console.log(
    "  " +
    "Email".padEnd(42) +
    "Role".padEnd(24) +
    "Auth ID".padEnd(12) +
    "Status"
  );
  console.log("  " + "─".repeat(76));
  for (const r of results) {
    console.log(
      "  " +
      r.email.padEnd(42) +
      r.role.padEnd(24) +
      r.authId.padEnd(12) +
      r.status
    );
  }
  console.log();

  const failed = results.filter(r => r.status !== "RESET ✓");
  if (failed.length === 0) {
    console.log(
      "✅ All " + results.length + " passwords reset successfully.\n" +
      "   All demo accounts now use the password from RRAI_SEED_PASSWORD.\n\n" +
      'Tell IBM Bob "passwords reset" to proceed with the login test.\n'
    );
  } else {
    console.log(
      `⚠  ${failed.length} account(s) failed or were not found — see table above.\n` +
      "   Re-run this script to retry. Failed accounts are:\n" +
      failed.map(r => `     ${r.email} — ${r.status}`).join("\n") + "\n"
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\nFATAL:", err.message);
  process.exit(1);
});
