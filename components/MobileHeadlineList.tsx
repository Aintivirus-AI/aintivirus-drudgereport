"use client";

import { useState, useMemo } from "react";
import type { Headline } from "@/lib/types";
import { HeadlineLink } from "./HeadlineLink";

type SortMode = "popular" | "recent";

interface MobileHeadlineListProps {
  headlines: Headline[];
}

export function MobileHeadlineList({ headlines }: MobileHeadlineListProps) {
  const [sortMode, setSortMode] = useState<SortMode>("popular");

  const sorted = useMemo(() => {
    if (sortMode === "recent") {
      return [...headlines].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    // "popular" = default order from DB (wagmi_count DESC, created_at DESC)
    return headlines;
  }, [headlines, sortMode]);

  if (headlines.length === 0) {
    return (
      <div className="text-dark-300 text-sm text-center py-8 opacity-50">
        No headlines yet...
      </div>
    );
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSortMode("popular")}
          className={`mobile-filter-tab ${sortMode === "popular" ? "mobile-filter-tab--active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Most Popular
        </button>
        <button
          onClick={() => setSortMode("recent")}
          className={`mobile-filter-tab ${sortMode === "recent" ? "mobile-filter-tab--active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Most Recent
        </button>
      </div>

      {/* Unified headline list */}
      <ul className="space-y-1">
        {sorted.map((headline) => (
          <HeadlineLink key={headline.id} headline={headline} />
        ))}
      </ul>
    </div>
  );
}
