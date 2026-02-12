"use client";

import { useState, useMemo } from "react";
import type { Headline } from "@/lib/types";
import { HeadlineLink } from "./HeadlineLink";

type SortMode = "popular" | "trending" | "recent";

/** Trending score: votes weighted by recency (HN-style gravity) */
function trendingScore(h: Headline): number {
  const ageHours = (Date.now() - new Date(h.created_at).getTime()) / 3_600_000;
  return (h.wagmi_count + 1) / Math.pow(ageHours + 2, 1.5);
}

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
    if (sortMode === "trending") {
      return [...headlines].sort((a, b) => trendingScore(b) - trendingScore(a));
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
      <div className="mobile-filter-bar">
        <button
          onClick={() => setSortMode("recent")}
          className={`mobile-filter-tab ${sortMode === "recent" ? "mobile-filter-tab--active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 flex-shrink-0">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Newest
        </button>
        <button
          onClick={() => setSortMode("trending")}
          className={`mobile-filter-tab ${sortMode === "trending" ? "mobile-filter-tab--active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 flex-shrink-0">
            <path d="M12 22c-4.97 0-9-3.58-9-8 0-2.1.86-4.13 2.38-5.62L12 2l6.62 6.38A8.07 8.07 0 0121 14c0 4.42-4.03 8-9 8z" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M12 22c-1.66 0-3-1.79-3-4 0-1.05.43-2.06 1.19-2.81L12 13.5l1.81 1.69A3.99 3.99 0 0115 18c0 2.21-1.34 4-3 4z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Trending
        </button>
        <button
          onClick={() => setSortMode("popular")}
          className={`mobile-filter-tab ${sortMode === "popular" ? "mobile-filter-tab--active" : ""}`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 flex-shrink-0">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Popular
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
