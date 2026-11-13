/**
 * Authentication and Organization-Scoping Middleware — RRAI
 *
 * Two sequential middleware layers applied to all authenticated routes:
 *
 *   1. Auth Middleware — verifies the Supabase JWT from the Authorization
 *      header. Rejects unauthenticated requests with 401 Unauthorized.
 *      Does NOT apply to: POST /api/incidents, POST /api/webhooks/112
 *
 *   2. Org Scoping Middleware — extracts organization_id from the verified
 *      JWT app_metadata claims (injected by the custom_access_token Auth Hook,
 *      OA-7). Returns 403 Forbidden if the claim is missing or malformed.
 *
 * Architecture v1.7 §2.2, §7.1, §7.2, §7.3, §7.4
 *
 * USAGE in API route handlers:
 *
 *   import { requireAuth } from "@/lib/supabase/middleware";
 *
 *   export async function GET(request: NextRequest) {
 *     const auth = await requireAuth(request);
 *     if (auth.error) return auth.error;
 *     const { userId, role, organizationId } = auth;
 *     // proceed with org-scoped query
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuthContext = {
  userId: string;
  role: string;
  organizationId: string;
  hospitalId: string | null;
};

export type AuthResult =
  | ({ error: null } & AuthContext)
  | { error: NextResponse; userId?: never; role?: never; organizationId?: never; hospitalId?: never };

// ---------------------------------------------------------------------------
// requireAuth
// Verifies the Supabase JWT and extracts app_metadata claims.
// Returns a structured AuthContext on success, or a NextResponse error.
// ---------------------------------------------------------------------------
export async function requireAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      error: NextResponse.json(
        { error: "UNAUTHORIZED", message: "Authentication required." },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.replace("Bearer ", "");

  // Use the anon key client to verify the JWT.
  // The anon client with a user token operates in the user's context with RLS enforced.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: { user }, error } = await client.auth.getUser();

  if (error || !user) {
    return {
      error: NextResponse.json(
        { error: "UNAUTHORIZED", message: "Invalid or expired session." },
        { status: 401 }
      ),
    };
  }

  // Extract custom claims from app_metadata (set by custom_access_token Auth Hook)
  const appMeta = user.app_metadata as Record<string, string | null> | undefined;
  const role = appMeta?.role;
  const organizationId = appMeta?.organization_id;
  const hospitalId = appMeta?.hospital_id ?? null;

  if (!role || !organizationId) {
    // Auth Hook (OA-7) has not been configured or the user record is not in
    // the users table yet. Block access until the hook is live.
    return {
      error: NextResponse.json(
        {
          error: "MISSING_ROLE_CLAIMS",
          message:
            "User session is missing required role claims. " +
            "Ensure the custom_access_token Auth Hook is configured (OA-7).",
        },
        { status: 403 }
      ),
    };
  }

  return {
    error: null,
    userId: user.id,
    role,
    organizationId,
    hospitalId: hospitalId || null,
  };
}

// ---------------------------------------------------------------------------
// requireRole
// Convenience wrapper — calls requireAuth and additionally checks that the
// authenticated user has one of the permitted roles.
// ---------------------------------------------------------------------------
export async function requireRole(
  request: NextRequest,
  permittedRoles: string[]
): Promise<AuthResult> {
  const auth = await requireAuth(request);
  if (auth.error) return auth;

  if (!permittedRoles.includes(auth.role)) {
    return {
      error: NextResponse.json(
        {
          error: "FORBIDDEN",
          message: `Role '${auth.role}' is not permitted for this action. Required: ${permittedRoles.join(", ")}.`,
        },
        { status: 403 }
      ),
    };
  }

  return auth;
}
