"use client";

import { useState, useRef, useEffect } from "react";
import { EarnModal } from "./EarnModal";

const CA = "7Epmyp9dMD5SzUtxczbuWwsVARyWdzLFAkzxnvZWpump";
const PUMP_URL = `https://pump.fun/coin/${CA}`;

export function TokenTicker() {
  const [copied, setCopied] = useState(false);
  const [earnOpen, setEarnOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard?.writeText(CA)
      .then(() => {
        setCopied(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        // Clipboard permission denied — fail silently
      });
  };

  return (
    <div className="token-ticker">
      {/* $NEWS address pill */}
      <div className="token-ticker-inner">
        <a
          href={PUMP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="token-ticker-badge"
        >
          <img
            src="/mcafee-logo.png"
            alt="McAfee Report"
            className="token-ticker-logo"
          />
          $NEWS
        </a>
        <span className="token-ticker-ca">
          {CA.slice(0, 6)}...{CA.slice(-4)}
        </span>
        <button
          onClick={handleCopy}
          className="token-ticker-copy"
          title="Copy contract address"
        >
          {copied ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          )}
        </button>
      </div>

      {/* Quick links row */}
      <div className="token-ticker-links">
        <a href="/leaderboard" className="token-ticker-link token-ticker-link--gold">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
            <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Leaderboard
        </a>
        <span className="token-ticker-links-dot">·</span>
        <button
          onClick={() => setEarnOpen(true)}
          className="token-ticker-link token-ticker-link--rainbow"
        >
          Earn Now
        </button>
      </div>

      <EarnModal open={earnOpen} onClose={() => setEarnOpen(false)} />
    </div>
  );
}
