"use client";

import { useState, useEffect } from "react";

export function MayhemBanner() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch("/api/admin/mayhem");
        const data = await res.json();
        if (!cancelled) setEnabled(data.enabled === true);
      } catch {
        // Silent fail
      }
    }

    check();
    // Poll every 30 seconds
    const interval = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!enabled) return null;

  return (
    <div className="mayhem-banner">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-center gap-2 py-2 text-sm font-bold tracking-wider">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 animate-pulse">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>MAYHEM MODE ACTIVE</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 animate-pulse">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
