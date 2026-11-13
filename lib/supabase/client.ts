/**
 * Supabase browser-side client — RRAI
 *
 * Uses NEXT_PUBLIC_SUPABASE_ANON_KEY for user-context operations:
 * - All authenticated routes: agent dashboard, hospital admin, org admin
 * - User sign-in / sign-out / session management
 *
 * This client respects Row-Level Security (RLS). All queries are
 * automatically scoped by the authenticated user's JWT claims
 * (role, organization_id, hospital_id — injected by the
 * custom_access_token Auth Hook, OA-7).
 *
 * Architecture v1.7 §7.1, §7.2, §11.3
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
}
if (!supabaseAnonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.");
}

/**
 * Browser-side Supabase client. Safe to use in:
 *   - Client components ('use client')
 *   - Next.js pages that require user session access
 *
 * This client's key is safe to expose in the browser (anon key).
 * It has no elevated privileges without a valid user JWT.
 */
export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
