"use client";

import { useState, useEffect } from "react";

interface SentimentData {
  wagmi: number;
  ngmi: number;
  ratio: number;
}

export function SentimentMeter() {
  const [sentiment, setSentiment] = useState<SentimentData | null>(null);

  useEffect(() => {
    const fetchSentiment = () => {
      fetch("/api/votes?aggregate=true")
        .then(res => res.json())
        .then(data => setSentiment(data))
        .catch(() => {});
    };

    fetchSentiment();
    const interval = setInterval(fetchSentiment, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, []);

  if (!sentiment || (sentiment.wagmi === 0 && sentiment.ngmi === 0)) {
    return null;
  }

  const total = sentiment.wagmi + sentiment.ngmi;
  const wagmiPercent = Math.round(sentiment.ratio * 100);
  const ngmiPercent = 100 - wagmiPercent;

  // Determine sentiment label
  let moodLabel = "NEUTRAL";
  let moodColor = "var(--content-text-secondary)";
  if (wagmiPercent >= 70) {
    moodLabel = "BULLISH";
    moodColor = "#00ff9d";
  } else if (wagmiPercent >= 55) {
    moodLabel = "LEANING BULLISH";
    moodColor = "#00D3FF";
  } else if (ngmiPercent >= 70) {
    moodLabel = "BEARISH";
    moodColor = "#ef4444";
  } else if (ngmiPercent >= 55) {
    moodLabel = "LEANING BEARISH";
    moodColor = "#f97316";
  }

  return (
    <div className="sentiment-meter">
      <div className="sentiment-header">
        <span className="sentiment-title">COMMUNITY SENTIMENT</span>
        <span className="sentiment-mood" style={{ color: moodColor }}>{moodLabel}</span>
        <span className="sentiment-total">{total} votes</span>
      </div>
      <div className="sentiment-bar">
        <div
          className="sentiment-bar-wagmi"
          style={{ width: `${wagmiPercent}%` }}
        />
      </div>
      <div className="sentiment-labels">
        <span className="sentiment-wagmi">WAGMI {wagmiPercent}%</span>
        <span className="sentiment-ngmi">NGMI {ngmiPercent}%</span>
      </div>
    </div>
  );
}
