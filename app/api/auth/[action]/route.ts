/**
 * POST /api/auth/login  — Sign in with email + password
 * POST /api/auth/logout — Sign out current session
 *
 * Uses a per-request Supabase client (anon key).
 * A fresh client is created on every request to avoid session state
 * bleeding across requests in the same server worker process.
 *
 * IMPORTANT: app_metadata claims (role, organization_id) are injected by the
 * custom_access_token hook into the JWT at sign-in time. They are NOT stored
 * in auth.users.raw_app_meta_data. We therefore decode the JWT payload directly
 * to read these claims for the login response.
 *
 * Architecture v1.7 §7.1
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function makeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Decode JWT payload (base64url) without verifying signature */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.pathname.endsWith("logout") ? "logout" : "login";

  if (action === "logout") {
    // Logout is stateless on the server — just confirm to the client
    return NextResponse.json({ message: "Signed out." });
  }

  let body: { email: string; password: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.email || !body.password) {
    return NextResponse.json({ error: "email and password are required." }, { status: 400 });
  }

  const supabase = makeClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });

  if (error || !data.session) {
    // Log raw Supabase error server-side only — never forwarded to the client
    console.error(
      "[POST /api/auth/login] Auth error:", error?.message,
      "| code:", (error as { code?: string } | null)?.code
    );
    return NextResponse.json(
      { error: "INVALID_CREDENTIALS", message: "Invalid email or password." },
      { status: 401 }
    );
  }

  // Decode the access token to read hook-injected app_metadata claims.
  // signInWithPassword's data.user.app_metadata reflects the database record,
  // not the hook-injected JWT claims. The JWT payload is the authoritative source.
  const jwtPayload = decodeJwtPayload(data.session.access_token);
  const appMeta = jwtPayload?.app_metadata as Record<string, string> | undefined;

  return NextResponse.json({
    access_token: data.session.access_token,
    user: {
      id: data.user?.id,
      email: data.user?.email,
      role: appMeta?.role ?? null,
      organization_id: appMeta?.organization_id ?? null,
      hospital_id: appMeta?.hospital_id ?? null,
    },
  });
}
