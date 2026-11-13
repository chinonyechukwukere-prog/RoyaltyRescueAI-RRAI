"use client";

/**
 * Dashboard layout — wraps all /dashboard/* pages
 * Client-side auth guard: redirects to /dashboard/login if no token in sessionStorage.
 * Architecture v1.7 §2.1, §7.3
 */

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

type User = { id: string; email: string; role: string; organization_id: string };

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = sessionStorage.getItem("rrai_token");
    const userRaw = sessionStorage.getItem("rrai_user");
    if (!token || !userRaw) {
      router.replace("/dashboard/login");
      return;
    }
    try {
      setUser(JSON.parse(userRaw) as User);
    } catch {
      router.replace("/dashboard/login");
      return;
    }
    setChecked(true);
  }, [router]);

  function handleSignOut() {
    sessionStorage.removeItem("rrai_token");
    sessionStorage.removeItem("rrai_user");
    fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push("/dashboard/login");
  }

  // Skip auth guard for the login page itself
  if (pathname === "/dashboard/login") return <>{children}</>;
  if (!checked) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Top nav */}
      <header className="border-b border-border bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-sm font-bold text-primary">Royalty Rescue AI</span>
            <nav className="flex gap-4 text-sm">
              <Link
                href="/dashboard"
                className="text-muted-foreground hover:text-foreground transition"
              >
                Incidents
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground hidden sm:block">
              {user?.email} · <span className="capitalize">{user?.role?.replace(/_/g, " ")}</span>
            </span>
            <button
              onClick={handleSignOut}
              className="text-xs text-muted-foreground hover:text-foreground transition"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Synthetic data notice */}
      <div className="bg-amber-50 border-b border-amber-200">
        <div className="mx-auto max-w-6xl px-4 py-1.5 text-xs text-amber-700">
          Prototype demonstration system — all data is fictional and used for training purposes only
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
