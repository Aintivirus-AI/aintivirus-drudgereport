"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface EarnModalProps {
  open: boolean;
  onClose: () => void;
}

export function EarnModal({ open, onClose }: EarnModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Wait for client mount so createPortal has a target
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      ref={backdropRef}
      className="earn-modal-backdrop"
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
    >
      <div className="earn-modal" role="dialog" aria-modal="true" aria-label="How to earn crypto">
        {/* Close button */}
        <button onClick={onClose} className="earn-modal-close" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Header */}
        <div className="earn-modal-header">
          <h2 className="earn-modal-title">
            How to <span className="text-neon-green">Earn</span> with The McAfee Report
          </h2>
          <p className="earn-modal-subtitle">
            Submit breaking news. Get paid in crypto. It takes 30 seconds.
          </p>
        </div>

        {/* Steps */}
        <div className="submit-cta-steps">
          <div className="submit-cta-step">
            <div className="submit-cta-step-num">1</div>
            <div>
              <p className="text-sm font-medium text-white">Find breaking news</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Crypto, markets, regulation, tech — anything the community needs to know
              </p>
            </div>
          </div>

          <div className="submit-cta-step">
            <div className="submit-cta-step-num">2</div>
            <div>
              <p className="text-sm font-medium text-white">Submit via Telegram</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Open our bot, type <code className="text-neon-cyan/80 bg-dark-100/80 px-1.5 py-0.5 rounded text-[11px] font-mono">/submit</code>, paste the link + your Solana wallet. 30 seconds.
              </p>
            </div>
          </div>

          <div className="submit-cta-step">
            <div className="submit-cta-step-num">3</div>
            <div>
              <p className="text-sm font-medium text-white">AI validates & publishes</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Our AI fact-checks, scores, and generates a McAfee-style headline. If approved, it goes live.
              </p>
            </div>
          </div>

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
        <div className="submit-cta-revenue mt-6">
          <div className="flex items-center gap-2.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5 text-neon-green flex-shrink-0">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div>
              <p className="text-sm font-medium text-white">No investment needed. No coding.</p>
              <p className="text-xs text-gray-400">Just find real, breaking news before others do. Top submitters are earning every day.</p>
            </div>
          </div>
        </div>

        {/* CTA button */}
        <div className="mt-6">
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
        </div>

        {/* Quick start hint */}
        <p className="text-[11px] text-gray-500 mt-4 text-center sm:text-left">
          After opening the bot, type <code className="text-neon-cyan/60 font-mono">/submit</code> and follow the prompts. That&apos;s it.
        </p>
      </div>
    </div>,
    document.body
  );
}
