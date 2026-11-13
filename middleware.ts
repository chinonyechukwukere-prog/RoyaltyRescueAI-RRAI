/**
 * Next.js Edge Middleware — RRAI
 *
 * Protects /dashboard/* routes (except /dashboard/login).
 * Redirects unauthenticated requests to /dashboard/login.
 *
 * Note: The session token is stored in sessionStorage by the client-side login flow,
 * which is not accessible in edge middleware. This middleware performs a lightweight
 * cookie-based check for the Supabase session cookie ('sb-*-auth-token').
 * The authoritative auth gate is requireAuth() / requireRole() on each API route.
 *
 * Architecture v1.7 §7.1, §7.3
 */

import { NextRequest, NextResponse } from "next/server";

// Routes under /dashboard that do NOT require authentication
const PUBLIC_DASHBOARD_PATHS = ["/dashboard/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only apply to /dashboard/* routes
  if (!pathname.startsWith("/dashboard")) {
    return NextResponse.next();
  }

  // Allow public paths
  if (PUBLIC_DASHBOARD_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for Supabase auth session cookie (set by supabase-js on sign-in)
  // Cookie name pattern: sb-<project-ref>-auth-token
  const hasSession = Array.from(request.cookies.getAll()).some(
    (c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token")
  );

  if (!hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/dashboard/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
