"use client";

/**
 * Org Admin Panel layout — /dashboard/admin/*
 * Guards: org_admin role only. Redirects other roles to /dashboard.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const user = JSON.parse(sessionStorage.getItem("rrai_user") ?? "{}");
    if (user.role !== "org_admin") {
      router.replace("/dashboard");
      return;
    }
    setChecked(true);
  }, [router]);

  if (!checked) return null;
  return <>{children}</>;
}
