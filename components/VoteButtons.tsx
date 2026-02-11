"use client";

import { useState, useEffect, useCallback } from "react";
import { UpArrowIcon, DownArrowIcon } from "./Icons";

interface VoteButtonsProps {
  headlineId: number;
  /** Compact mode for inline display on headline links */
  compact?: boolean;
}

interface VoteState {
  wagmi: number;
  ngmi: number;
  voted: string | null;
}

export function VoteButtons({ headlineId, compact = false }: VoteButtonsProps) {
  const [state, setState] = useState<VoteState>({ wagmi: 0, ngmi: 0, voted: null });
  const [loading, setLoading] = useState(false);

  // Check localStorage for previous vote + fetch counts
  useEffect(() => {
    const stored = localStorage.getItem(`vote_${headlineId}`);
    
    fetch(`/api/votes?headline_id=${headlineId}&check=true`)
      .then(res => res.json())
      .then(data => {
        setState({
          wagmi: data.wagmi || 0,
          ngmi: data.ngmi || 0,
          voted: stored || data.voted || null,
        });
      })
      .catch(() => {
        // Use localStorage fallback
        if (stored) {
          setState(prev => ({ ...prev, voted: stored }));
        }
      });
  }, [headlineId]);

  const castVote = useCallback(async (voteType: "wagmi" | "ngmi") => {
    if (state.voted || loading) return;
    setLoading(true);

    // Optimistic update
    setState(prev => ({
      ...prev,
      [voteType]: prev[voteType] + 1,
      voted: voteType,
    }));
    localStorage.setItem(`vote_${headlineId}`, voteType);
    window.dispatchEvent(new CustomEvent("voteCast"));

    try {
      const res = await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headline_id: headlineId, vote_type: voteType }),
      });
      const data = await res.json();
      setState({
        wagmi: data.wagmi,
        ngmi: data.ngmi,
        voted: voteType,
      });
    } catch {
      // Keep optimistic state
    } finally {
      setLoading(false);
    }
  }, [headlineId, state.voted, loading]);

  const total = state.wagmi + state.ngmi;
  const wagmiPercent = total > 0 ? Math.round((state.wagmi / total) * 100) : 50;

  if (compact) {
    return (
      <div className="vote-compact">
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); castVote("wagmi"); }}
          className={`vote-compact-btn vote-wagmi ${state.voted === "wagmi" ? "vote-active" : ""} ${state.voted ? "vote-disabled" : ""}`}
          disabled={!!state.voted}
          title="WAGMI"
        >
          <UpArrowIcon size={12} />
          {total > 0 && <span className="vote-compact-count">{state.wagmi}</span>}
        </button>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); castVote("ngmi"); }}
          className={`vote-compact-btn vote-ngmi ${state.voted === "ngmi" ? "vote-active" : ""} ${state.voted ? "vote-disabled" : ""}`}
          disabled={!!state.voted}
          title="NGMI"
        >
          <DownArrowIcon size={12} />
          {total > 0 && <span className="vote-compact-count">{state.ngmi}</span>}
        </button>
      </div>
    );
  }

  return (
    <div className="vote-full">
      <div className="vote-buttons-row">
        <button
          onClick={() => castVote("wagmi")}
          className={`vote-btn vote-btn-wagmi ${state.voted === "wagmi" ? "vote-active" : ""} ${state.voted ? "vote-disabled" : ""}`}
          disabled={!!state.voted}
        >
          <UpArrowIcon size={20} />
          <span className="vote-label">WAGMI</span>
          <span className="vote-count">{state.wagmi}</span>
        </button>

        <button
          onClick={() => castVote("ngmi")}
          className={`vote-btn vote-btn-ngmi ${state.voted === "ngmi" ? "vote-active" : ""} ${state.voted ? "vote-disabled" : ""}`}
          disabled={!!state.voted}
        >
          <DownArrowIcon size={20} />
          <span className="vote-label">NGMI</span>
          <span className="vote-count">{state.ngmi}</span>
        </button>
      </div>

      {total > 0 && (
        <div className="vote-bar-container">
          <div className="vote-bar">
            <div
              className="vote-bar-fill vote-bar-wagmi"
              style={{ width: `${wagmiPercent}%` }}
            />
          </div>
          <div className="vote-bar-labels">
            <span className="vote-bar-label-wagmi">{wagmiPercent}% WAGMI</span>
            <span className="vote-bar-label-ngmi">{100 - wagmiPercent}% NGMI</span>
          </div>
        </div>
      )}
    </div>
  );
}
