"use client";

import { useState } from "react";

export function SubmitCTA() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="submit-cta-wrapper">
      {/* Collapsed teaser */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="submit-cta-toggle"
        aria-expanded={expanded}
      >
        <div className="flex items-center justify-center w-full">
          <span className="submit-cta-tagline">
            Submit News. Launch Tokens. Earn Crypto.
          </span>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`w-5 h-5 text-gray-400 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Expanded content */}
      <div
        className={`submit-cta-body ${expanded ? "submit-cta-body--open" : ""}`}
      >
        <div className="submit-cta-inner">
          {/* How it works */}
          <h3 className="text-sm font-semibold text-white/90 uppercase tracking-widest mb-5 text-center">
            How it works
          </h3>

          <div className="submit-cta-steps max-w-lg mx-auto">
            {/* Step 1 */}
            <div className="submit-cta-step">
              <div className="submit-cta-step-num">1</div>
              <div>
                <p className="text-sm font-medium text-white">Find breaking news</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Crypto, markets, regulation, tech — anything the community needs to know
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="submit-cta-step">
              <div className="submit-cta-step-num">2</div>
              <div>
                <p className="text-sm font-medium text-white">Submit via Telegram</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Open our bot, type <code className="text-neon-cyan/80 bg-dark-100/80 px-1.5 py-0.5 rounded text-[11px] font-mono">/submit</code>, paste the link + your Solana wallet. 30 seconds.
                </p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="submit-cta-step">
              <div className="submit-cta-step-num">3</div>
              <div>
                <p className="text-sm font-medium text-white">AI validates & publishes</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Our AI fact-checks, scores, and generates a McAfee-style headline. If approved, it goes live.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="submit-cta-step">
              <div className="submit-cta-step-num highlight">$</div>
              <div>
                <p className="text-sm font-medium text-neon-green">A token launches & you earn</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Every published story auto-deploys a token on pump.fun. <span className="text-white/80 font-medium">You receive 50% of all creator fees</span> — sent directly to your wallet.
                </p>
              </div>
            </div>
          </div>

          {/* Revenue highlight */}
          <div className="max-w-lg mx-auto">
            <div className="submit-cta-revenue">
              <div className="flex items-center gap-2.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-neon-green flex-shrink-0">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="text-left">
                  <p className="text-sm font-medium text-white">No investment needed. No coding.</p>
                  <p className="text-xs text-gray-400">Just find real, breaking news before others do. Top submitters are earning every day.</p>
                </div>
              </div>
            </div>
          </div>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6 justify-center max-w-lg mx-auto">
            <a
              href="https://t.me/mcafeereport_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="submit-cta-button-primary"
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
              </svg>
              Open Telegram Bot
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <path d="M7 17L17 7M17 7H7M17 7v10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a
              href="/analytics"
              className="submit-cta-button-secondary"
            >
              View Analytics
            </a>
          </div>

          {/* Quick start hint */}
          <p className="text-[11px] text-gray-500 mt-4 text-center">
            After opening the bot, type <code className="text-neon-cyan/60 font-mono">/submit</code> and follow the prompts. That&apos;s it.
          </p>
        </div>
      </div>
    </div>
  );
}
