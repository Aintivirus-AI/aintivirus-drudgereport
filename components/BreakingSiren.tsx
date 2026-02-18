"use client";

import { useState, useEffect, useCallback } from "react";
import type { Headline } from "@/lib/types";

interface BreakingSirenProps {
  headline: Headline | null;
}

export function BreakingSiren({ headline }: BreakingSirenProps) {
  const [dismissed, setDismissed] = useState(true);
  const [audioPlayed, setAudioPlayed] = useState(false);

  useEffect(() => {
    if (!headline) {
      setDismissed(true);
      return;
    }

    // Check if this particular siren was already dismissed
    const dismissedId = localStorage.getItem("siren_dismissed_id");
    if (dismissedId === String(headline.id)) {
      setDismissed(true);
    } else {
      setDismissed(false);
      setAudioPlayed(false);
    }
  }, [headline]);

  // Play siren sound via Web Audio API
  const playSiren = useCallback(() => {
    if (audioPlayed) return;
    setAudioPlayed(true);

    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();

      oscillator.connect(gain);
      gain.connect(ctx.destination);

      oscillator.type = "sawtooth";
      gain.gain.setValueAtTime(0.08, ctx.currentTime);

      // Siren sweep: low → high → low
      oscillator.frequency.setValueAtTime(400, ctx.currentTime);
      oscillator.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.5);
      oscillator.frequency.linearRampToValueAtTime(400, ctx.currentTime + 1.0);
      oscillator.frequency.linearRampToValueAtTime(800, ctx.currentTime + 1.5);

      // Fade out
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 2.0);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 2.0);
    } catch {
      // Audio not available — that's fine
    }
  }, [audioPlayed]);

  // Trigger audio on first user interaction with the siren
  useEffect(() => {
    if (!dismissed && headline && !audioPlayed) {
      // Try to play on mount; if blocked, play on first click anywhere
      const handleInteraction = () => {
        playSiren();
        document.removeEventListener("click", handleInteraction);
      };
      document.addEventListener("click", handleInteraction, { once: true });
      return () => document.removeEventListener("click", handleInteraction);
    }
  }, [dismissed, headline, audioPlayed, playSiren]);

  const handleDismiss = () => {
    if (headline) {
      localStorage.setItem("siren_dismissed_id", String(headline.id));
    }
    setDismissed(true);
  };

  if (!headline || dismissed) return null;

  return (
    <div className="siren-container" onClick={playSiren}>
      <div className="siren-banner">
        {/* Flashing lights */}
        <div className="siren-light siren-light-left" />
        <div className="siren-light siren-light-right" />

        <div className="siren-content">
          {/* Siren icon */}
          <div className="siren-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
              <path d="M12 2L12 6" strokeLinecap="round" />
              <path d="M12 18C8.686 18 6 15.314 6 12C6 8.686 8.686 6 12 6C15.314 6 18 8.686 18 12C18 15.314 15.314 18 12 18Z" />
              <path d="M12 18V22" strokeLinecap="round" />
              <path d="M4 22H20" strokeLinecap="round" />
              <path d="M3.5 8.5L5.5 10" strokeLinecap="round" />
              <path d="M20.5 8.5L18.5 10" strokeLinecap="round" />
            </svg>
          </div>

          <div className="siren-text">
            <span className="siren-label">BREAKING</span>
            <a
              href={`/article/${headline.id}`}
              className="siren-headline"
            >
              {headline.title}
            </a>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="siren-dismiss"
            aria-label="Dismiss siren"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
