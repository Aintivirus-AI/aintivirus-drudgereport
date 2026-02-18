"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Invisible client component that fires a POST to /api/page-views
 * on every client-side navigation. Fire-and-forget — no UI.
 */
export function PageViewTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;

    fetch("/api/page-views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
    }).catch(() => {
      // Silently ignore — analytics should never break the page
    });
  }, [pathname]);

  return null;
}
