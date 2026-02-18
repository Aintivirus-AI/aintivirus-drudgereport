"use client";

import { useState, useEffect, useCallback } from "react";
import { TokenBadge } from "@/components/TokenBadge";

interface Launch {
  token_id: number;
  token_name: string;
  ticker: string;
  mint_address: string | null;
  pump_url: string | null;
  token_image_url: string | null;
  headline_title: string;
  headline_id: number;
  created_at: string;
}

type Period = "day" | "week" | "month" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  all: "All Time",
};

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

export function TokenLaunches() {
  const [period, setPeriod] = useState<Period>("all");
  const [launches, setLaunches] = useState<Launch[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLaunches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/token-launches?period=${period}`);
      const data = await res.json();
      if (data.launches) setLaunches(data.launches);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchLaunches();
  }, [fetchLaunches]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-neon-cyan border-b border-dark-200/30 pb-2 mb-4">
        TOKEN LAUNCHES
      </h2>

      <div className="flex gap-1 mb-4">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              period === p
                ? "bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30"
                : "bg-dark-100/50 text-gray-500 border border-dark-200/30 hover:text-gray-300"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-500 text-sm py-8 text-center">Loading...</p>
      ) : launches.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">No tokens launched yet.</p>
      ) : (
        <div className="space-y-2">
          {launches.map((launch) => {
            const Row = launch.pump_url ? "a" : "div";
            const linkProps = launch.pump_url
              ? { href: launch.pump_url, target: "_blank" as const, rel: "noopener noreferrer" }
              : {};
            return (
              <Row
                key={launch.token_id}
                {...linkProps}
                className="flex items-center gap-3 p-3 rounded-lg bg-dark-100/50 border border-dark-200/30 hover:border-neon-cyan/20 transition-colors cursor-pointer block no-underline text-inherit"
              >
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
                    <span className="text-xs text-gray-400 truncate block">
                      {launch.headline_title || "View article"}
                    </span>
                  )}
                </div>

                <div className="text-right">
                  <p className="font-mono font-bold text-sm text-neon-cyan">${launch.ticker}</p>
                  <p className="text-[10px] text-gray-500">
                    {getTimeAgo(new Date(launch.created_at))}
                  </p>
                </div>
              </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}
