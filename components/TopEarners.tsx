"use client";

import { useState, useEffect, useCallback } from "react";

interface Earner {
  telegram_username: string | null;
  telegram_user_id: string;
  sol_address: string;
  total_earned_lamports: number;
  total_earned_sol: number;
  revenue_events_count: number;
}

type Period = "day" | "week" | "month" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  all: "All Time",
};

export function TopEarners() {
  const [period, setPeriod] = useState<Period>("all");
  const [earners, setEarners] = useState<Earner[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEarners = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/top-earners?period=${period}`);
      const data = await res.json();
      if (data.earners) setEarners(data.earners);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchEarners();
  }, [fetchEarners]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-neon-cyan border-b border-dark-200/30 pb-2 mb-4">
        TOP EARNERS
      </h2>

      {/* Period filter */}
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
      ) : earners.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">No earnings data yet.</p>
      ) : (
        <div className="space-y-2">
          {earners.map((earner, index) => (
            <div
              key={earner.telegram_user_id}
              className="flex items-center gap-3 p-3 rounded-lg bg-dark-100/50 border border-dark-200/30 hover:border-neon-cyan/20 transition-colors"
            >
              {/* Rank */}
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                  ${
                    index === 0
                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                      : index === 1
                        ? "bg-gray-400/20 text-gray-300 border border-gray-400/30"
                        : index === 2
                          ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                          : "bg-dark-200/50 text-gray-500 border border-dark-200/30"
                  }
                `}
              >
                {index + 1}
              </div>

              {/* Name / wallet */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate font-mono">
                  {earner.sol_address.slice(0, 4)}...{earner.sol_address.slice(-4)}
                </p>
                <p className="text-xs text-gray-500">
                  {earner.revenue_events_count} revenue event{earner.revenue_events_count !== 1 ? "s" : ""}
                </p>
              </div>

              {/* SOL earned */}
              <div className="text-right">
                <p className="text-lg font-bold text-neon-cyan">
                  {earner.total_earned_sol < 0.01
                    ? earner.total_earned_sol.toFixed(4)
                    : earner.total_earned_sol.toFixed(2)}
                </p>
                <p className="text-[10px] text-gray-500 uppercase">SOL earned</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
