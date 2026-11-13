/**
 * POST /api/auth/login  — Sign in with email + password
 * POST /api/auth/logout — Sign out current session
 *
 * Uses Supabase Auth (anon key — user-context session)
 * Architecture v1.7 §7.1
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseClient } from "@/lib/supabase/client";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.pathname.endsWith("logout") ? "logout" : "login";

  if (action === "logout") {
    await supabaseClient.auth.signOut();
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

  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: body.email,
    password: body.password,
  });

  if (error || !data.session) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." }, { status: 401 });
  }

  return NextResponse.json({
    access_token: data.session.access_token,
    user: {
      id: data.user?.id,
      email: data.user?.email,
      role: data.user?.app_metadata?.role,
      organization_id: data.user?.app_metadata?.organization_id,
    },
  });
}
