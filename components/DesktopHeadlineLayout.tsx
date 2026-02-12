"use client";

import { useState, useMemo } from "react";
import type { Headline, MainHeadlineData } from "@/lib/types";
import { HeadlineColumn } from "./HeadlineColumn";
import { MainHeadline } from "./MainHeadline";

type SortMode = "popular" | "recent";

interface DesktopHeadlineLayoutProps {
  headlines: Headline[];
  mainHeadline: MainHeadlineData | null;
}

export function DesktopHeadlineLayout({
  headlines,
  mainHeadline,
}: DesktopHeadlineLayoutProps) {
  const [sortMode, setSortMode] = useState<SortMode>("popular");

  const sorted = useMemo(() => {
    if (sortMode === "recent") {
      return [...headlines].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
    // "popular" = default order from DB (wagmi_count DESC, created_at DESC)
    return headlines;
  }, [headlines, sortMode]);

  const leftHeadlines = sorted.filter((_, i) => i % 2 === 0);
  const rightHeadlines = sorted.filter((_, i) => i % 2 === 1);

  return (
    <div>
      {/* Desktop filter icons – far right */}
      <div className="flex justify-end gap-1 mb-4">
        <button
          onClick={() => setSortMode("popular")}
          className={`desktop-filter-icon ${sortMode === "popular" ? "desktop-filter-icon--active" : ""}`}
          title="Popular"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-3.5 h-3.5"
          >
            <path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          onClick={() => setSortMode("recent")}
          className={`desktop-filter-icon ${sortMode === "recent" ? "desktop-filter-icon--active" : ""}`}
          title="Newest"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-3.5 h-3.5"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline
              points="12 6 12 12 16 14"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {/* Three column layout */}
      <div className="grid lg:grid-cols-4 gap-8">
        {/* Left Column */}
        <div className="lg:col-span-1">
          <HeadlineColumn headlines={leftHeadlines} />
        </div>

        {/* Center - Main Headline */}
        <div className="lg:col-span-2">
          <MainHeadline headline={mainHeadline} />
        </div>

        {/* Right Column */}
        <div className="lg:col-span-1">
          <HeadlineColumn headlines={rightHeadlines} />
        </div>
      </div>
    </div>
  );
}
