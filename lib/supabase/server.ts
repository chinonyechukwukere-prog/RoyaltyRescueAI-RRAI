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

import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client. Import this only in:
 *   - Next.js API Route handlers (app/api/**)
 *   - Next.js Server Components that perform privileged operations
 *
 * Never import in client components or pages that run in the browser.
 *
 * LAZY INITIALISATION: The client is created on first use, not at module load.
 * This allows `next build` to collect page data without requiring runtime
 * secrets to be present in the build environment. The secret is validated
 * at request time — any missing config throws before the first DB call.
 */
let _client: SupabaseClient | null = null;

export const supabaseServer: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    if (!_client) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url) {
        throw new Error(
          "NEXT_PUBLIC_SUPABASE_URL is not set. Check your environment configuration."
        );
      }
      if (!key) {
        throw new Error(
          "SUPABASE_SERVICE_ROLE_KEY is not set. This is a required server-side secret."
        );
      }
      _client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    const value = (_client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(_client) : value;
  },
});
