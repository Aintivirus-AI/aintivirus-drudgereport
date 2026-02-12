"use client";

import { useState, useEffect, useCallback } from "react";
import { UpArrowIcon, DownArrowIcon } from "./Icons";

interface VoteButtonsProps {
  headlineId: number;
  /** Compact mode for inline display on headline links */
  compact?: boolean;
  /** Headline title for share prompt (full mode) */
  headlineTitle?: string;
}

interface VoteState {
  wagmi: number;
  ngmi: number;
  voted: string | null;
}

/** Show a one-time share prompt after voting (highest-intent viral loop). */
function PostVoteSharePrompt({ voteType, headlineId, title }: { voteType: string; headlineId: number; title?: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const siteUrl = typeof window !== "undefined"
    ? `${window.location.origin}/article/${headlineId}?utm_source=mcafee_report&utm_medium=post_vote&utm_campaign=share`
    : `/article/${headlineId}`;
  const voteLabel = voteType === "wagmi" ? "WAGMI" : "NGMI";
  const shareText = title
    ? `I voted ${voteLabel} on "${title}" — what do you think?\n${siteUrl}`
    : `I voted ${voteLabel}!\n${siteUrl}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(siteUrl)}&text=${encodeURIComponent(shareText)}`;

  return (
    <div className="mt-2 px-3 py-2 rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 text-xs text-gray-300 flex items-center gap-2 flex-wrap animate-fade-in">
      <span>Share your vote?</span>
      <a href={xUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors text-white">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
        X
      </a>
      <a href={tgUrl} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors text-white">
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
        </svg>
        TG
      </a>
      <button onClick={() => setDismissed(true)} className="ml-auto text-gray-500 hover:text-gray-300" aria-label="Dismiss">
        &times;
      </button>
    </div>
  );
}

export function VoteButtons({ headlineId, compact = false, headlineTitle }: VoteButtonsProps) {
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
  // When no votes, show 0% instead of misleading 50/50 split
  const wagmiPercent = total > 0 ? Math.round((state.wagmi / total) * 100) : 0;

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

      {/* Post-vote share prompt — highest-intent viral loop */}
      {state.voted && !compact && (
        <PostVoteSharePrompt voteType={state.voted} headlineId={headlineId} title={headlineTitle} />
      )}

      {/* Screen reader announcement */}
      <div aria-live="polite" className="sr-only">
        {state.voted && `You voted ${state.voted === "wagmi" ? "WAGMI" : "NGMI"}`}
      </div>
    </div>
  );
}
