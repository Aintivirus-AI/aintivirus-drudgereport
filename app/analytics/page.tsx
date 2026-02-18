import type { Metadata } from "next";
import { getPublishedTodayCount } from "@/lib/db";
import { SubmitCTA } from "@/components/SubmitCTA";
import { TopCoinsRibbon } from "@/components/TopCoinsRibbon";
import { SentimentMeter } from "@/components/SentimentMeter";
import { WarRoomFeed } from "@/components/WarRoomFeed";
import { TopEarners } from "@/components/TopEarners";
import { TopSubmitters } from "@/components/TopSubmitters";
import { TokenLaunches } from "@/components/TokenLaunches";
import { ThemeToggle } from "@/components/ThemeToggle";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Analytics | The McAfee Report",
  description: "Market sentiment, top-performing tokens, and community leaderboard on The McAfee Report.",
};

export default function AnalyticsPage() {
  const publishedToday = getPublishedTodayCount();

  return (
    <main className="main-content">
      <div className="min-h-screen grid-bg">
      {/* Header */}
      <div className="border-b border-dark-200/30 py-4">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <a href="/" className="text-neon-cyan hover:underline text-sm font-mono">
              &larr; Back to The McAfee Report
            </a>
            <div className="flex items-center gap-3">
              <span className="text-gray-500 text-xs font-mono">
                {publishedToday} articles published today
              </span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      {/* Top Coins Ribbon */}
      <TopCoinsRibbon />

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-3xl md:text-4xl font-bold text-center mb-2">
          <span className="text-neon-cyan">ANALYTICS</span>
        </h1>
        <p className="text-gray-400 text-center mb-10 text-sm">
          Market sentiment, top performers, and community leaderboard.
        </p>

        {/* Market Sentiment */}
        <div className="mb-10">
          <SentimentMeter alwaysShow />
        </div>

        {/* How to Earn CTA */}
        <div className="mb-8">
          <h3 className="text-lg font-bold text-white mb-4 text-center">Want to be on this leaderboard?</h3>
          <SubmitCTA />
        </div>

        {/* Leaderboard Section - 3 uniform columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div>
            <TopSubmitters />
          </div>
          <div>
            <TokenLaunches />
          </div>
          <div>
            <TopEarners />
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="mt-10">
          <div className="warroom-section">
            <div className="warroom-section-header">
              <span className="warroom-section-dot" />
              <span className="warroom-section-title">LIVE ACTIVITY</span>
            </div>
            <WarRoomFeed />
          </div>
        </div>

      </div>
      </div>
    </main>
  );
}
