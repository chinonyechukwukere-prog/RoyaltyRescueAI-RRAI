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
 *
 * HOW JWT CLAIM EXTRACTION WORKS
 * --------------------------------
 * Supabase's custom_access_token hook injects role/org claims into the JWT
 * payload at sign-in time. These claims live in the signed token itself —
 * they are NOT written back to auth.users.raw_app_meta_data in the database.
 *
 * supabase-js's getUser() makes a live /auth/v1/user API call and returns
 * the database record's app_metadata — which does NOT contain hook-injected
 * claims. We therefore:
 *   1. Call getUser() purely for token signature verification (liveness check).
 *   2. Decode the JWT payload directly to read hook-injected app_metadata claims.
 *
 * The JWT payload is base64url-encoded (not encrypted) and can be decoded
 * without the signing secret. We only need the secret to VERIFY the signature,
 * which getUser() handles by making a live round-trip to Supabase Auth.
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
// decodeJwtPayload
// Decodes the middle segment of a JWT (base64url → JSON).
// Does NOT verify the signature — used only after getUser() has confirmed
// the token is valid with Supabase's Auth server.
// ---------------------------------------------------------------------------
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    // base64url → base64 → Buffer → string
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// requireAuth
// 1. Verifies the JWT is live and belongs to a real Supabase Auth user.
// 2. Reads app_metadata claims from the JWT payload (hook-injected at sign-in).
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

  // Step 1 — verify the token is valid with Supabase Auth (live round-trip)
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

  // Step 2 — decode the JWT payload to read hook-injected app_metadata claims.
  // getUser() returns db-stored app_metadata which does NOT include hook claims.
  // The hook writes claims into the JWT at sign-in time, not into the database.
  const payload = decodeJwtPayload(token);
  const jwtAppMeta = payload?.app_metadata as Record<string, string | null> | undefined;

  // Fall back to getUser()'s app_metadata if JWT payload is missing it
  // (handles tokens issued before the hook was configured)
  const dbAppMeta = user.app_metadata as Record<string, string | null> | undefined;
  const appMeta = jwtAppMeta ?? dbAppMeta;

  const role = appMeta?.role;
  const organizationId = appMeta?.organization_id;
  const hospitalId = appMeta?.hospital_id ?? null;

  if (!role || !organizationId) {
    console.error(
      "[requireAuth] MISSING_ROLE_CLAIMS for user:", user.id,
      "| jwtAppMeta:", JSON.stringify(jwtAppMeta),
      "| dbAppMeta:", JSON.stringify(dbAppMeta)
    );
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
    hospitalId: hospitalId === "null" ? null : (hospitalId || null),
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
