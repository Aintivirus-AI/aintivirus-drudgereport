import type { Metadata } from "next";
import { getTopSubmitters, getRecentTokenLaunches, getPublishedTodayCount } from "@/lib/db";
import { TokenBadge } from "@/components/TokenBadge";
import { SubmitCTA } from "@/components/SubmitCTA";
import { ThemeToggle } from "@/components/ThemeToggle";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Leaderboard | The McAfee Report",
  description: "Top news submitters and recent token launches on The McAfee Report. Submit breaking news, earn crypto rewards.",
};

export default function LeaderboardPage() {
  const topSubmitters = getTopSubmitters(15);
  const recentLaunches = getRecentTokenLaunches(15);
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

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <h1 className="text-3xl md:text-4xl font-bold text-center mb-2">
          <span className="text-neon-cyan">LEADERBOARD</span>
        </h1>
        <p className="text-gray-400 text-center mb-10 text-sm">
          The people breaking the news. Submit stories, launch tokens, earn rewards.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Top Submitters */}
          <div>
            <h2 className="text-lg font-semibold text-neon-cyan border-b border-dark-200/30 pb-2 mb-4">
              TOP SUBMITTERS
            </h2>
            {topSubmitters.length === 0 ? (
              <p className="text-gray-500 text-sm py-8 text-center">No published submissions yet.</p>
            ) : (
              <div className="space-y-2">
                {topSubmitters.map((submitter, index) => (
                  <div
                    key={submitter.telegram_user_id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-dark-100/50 border border-dark-200/30 hover:border-dark-200/60 transition-colors"
                  >
                    {/* Rank */}
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                      ${index === 0 ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30" :
                        index === 1 ? "bg-gray-400/20 text-gray-300 border border-gray-400/30" :
                        index === 2 ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" :
                        "bg-dark-200/50 text-gray-500 border border-dark-200/30"
                      }
                    `}>
                      {index + 1}
                    </div>

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {submitter.telegram_username
                          ? `@${submitter.telegram_username}`
                          : `Anon #${index + 1}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        {submitter.total_submissions} submitted, {Math.round((submitter.published_count / submitter.total_submissions) * 100)}% hit rate
                      </p>
                    </div>

                    {/* Published count */}
                    <div className="text-right">
                      <p className="text-lg font-bold text-neon-cyan">{submitter.published_count}</p>
                      <p className="text-[10px] text-gray-500 uppercase">published</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Token Launches */}
          <div>
            <h2 className="text-lg font-semibold text-neon-cyan border-b border-dark-200/30 pb-2 mb-4">
              RECENT TOKEN LAUNCHES
            </h2>
            {recentLaunches.length === 0 ? (
              <p className="text-gray-500 text-sm py-8 text-center">No tokens launched yet.</p>
            ) : (
              <div className="space-y-2">
                {recentLaunches.map((launch) => (
                  <div
                    key={launch.token_id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-dark-100/50 border border-dark-200/30 hover:border-neon-cyan/20 transition-colors"
                  >
                    {/* Token image */}
                    {launch.token_image_url ? (
                      <img
                        src={launch.token_image_url}
                        alt={launch.ticker}
                        className="w-10 h-10 rounded-full border border-dark-200/50"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center text-neon-cyan font-bold text-xs">
                        {launch.ticker.substring(0, 2)}
                      </div>
                    )}

                    {/* Token info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{launch.token_name}</p>
                        {launch.pump_url && (
                          <TokenBadge
                            pumpUrl={launch.pump_url}
                            ticker={launch.ticker}
                            size="sm"
                            showTicker={false}
                          />
                        )}
                      </div>
                      {launch.headline_id && (
                        <a
                          href={`/article/${launch.headline_id}`}
                          className="text-xs text-gray-400 hover:text-neon-cyan truncate block"
                        >
                          {launch.headline_title || "View article"}
                        </a>
                      )}
                    </div>

                    {/* Ticker */}
                    <div className="text-right">
                      <p className="font-mono font-bold text-sm text-neon-cyan">${launch.ticker}</p>
                      <p className="text-[10px] text-gray-500">
                        {getTimeAgo(new Date(launch.created_at))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* How to Earn CTA */}
        <div className="mt-12 border-t border-dark-200/30 pt-8">
          <h3 className="text-lg font-bold text-white mb-4 text-center">Want to be on this leaderboard?</h3>
          <SubmitCTA />
        </div>
      </div>
      </div>
    </main>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
