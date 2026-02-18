"use client";

import { useState, useEffect, useCallback } from "react";

interface Submitter {
  telegram_username: string | null;
  telegram_user_id: string;
  sol_address: string;
  published_count: number;
  total_submissions: number;
}

type Period = "day" | "week" | "month" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
  all: "All Time",
};

export function TopSubmitters() {
  const [period, setPeriod] = useState<Period>("all");
  const [submitters, setSubmitters] = useState<Submitter[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSubmitters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/top-submitters?period=${period}`);
      const data = await res.json();
      if (data.submitters) setSubmitters(data.submitters);
    } catch {
      // Silent fail
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchSubmitters();
  }, [fetchSubmitters]);

  return (
    <div>
      <h2 className="text-lg font-semibold text-neon-cyan border-b border-dark-200/30 pb-2 mb-4">
        TOP SUBMITTERS
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
      ) : submitters.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">No published submissions yet.</p>
      ) : (
        <div className="space-y-2">
          {submitters.map((submitter, index) => (
            <div
              key={submitter.telegram_user_id}
              className="flex items-center gap-3 p-3 rounded-lg bg-dark-100/50 border border-dark-200/30 hover:border-dark-200/60 transition-colors"
            >
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

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate font-mono">
                  {submitter.sol_address.slice(0, 4)}...{submitter.sol_address.slice(-4)}
                </p>
                <p className="text-xs text-gray-500">
                  {submitter.total_submissions} submitted, {Math.round((submitter.published_count / submitter.total_submissions) * 100)}% hit rate
                </p>
              </div>

              <div className="text-right">
                <p className="text-lg font-bold text-neon-cyan">{submitter.published_count}</p>
                <p className="text-[10px] text-gray-500 uppercase">published</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
