/**
 * Supabase server-side client — RRAI
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY for system-context operations:
 * - Citizen portal incident creation (no user session present)
 * - Safety control: invalidating acceptance records after hospital status change
 * - Background job: marking hospital profiles as outdated
 * - Mock 112 webhook incident creation (Org B)
 *
 * SECURITY:
 * - This client bypasses Row-Level Security (RLS).
 * - NEVER expose this client or its key to the browser.
 * - NEVER use NEXT_PUBLIC_ prefix for SUPABASE_SERVICE_ROLE_KEY.
 * - All server-context writes must apply explicit organization_id scoping.
 * - Architecture v1.7 §10.1a, §11.3, §12
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL is not set. Check your environment configuration."
  );
}
if (!serviceRoleKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is not set. This is a required server-side secret."
  );
}

/**
 * Server-side Supabase client. Import this only in:
 *   - Next.js API Route handlers (app/api/**)
 *   - Next.js Server Components that perform privileged operations
 *
 * Never import in client components or pages that run in the browser.
 */
export const supabaseServer = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
