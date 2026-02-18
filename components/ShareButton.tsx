"use client";

import { useState, useRef, useEffect } from "react";

/**
 * Append UTM parameters for viral attribution tracking.
 */
function addUtm(url: string, medium: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}utm_source=mcafee_report&utm_medium=${medium}&utm_campaign=share`;
}

/**
 * Multi-platform share button with dropdown.
 * Supports: X, Telegram, Reddit, WhatsApp, Copy Link, and native Web Share API.
 */
export function ShareButton({ title, url, ticker, pumpUrl }: { title: string; url: string; ticker?: string; pumpUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const lines = [title];
  if (ticker && pumpUrl) {
    lines.push(`\n$${ticker} just launched\n${pumpUrl}`);
  } else if (ticker) {
    lines.push(`\n$${ticker}`);
  }
  const shareText = lines.join("");

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText + `\n${addUtm(url, "x")}`)}`;
  const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(addUtm(url, "telegram"))}&text=${encodeURIComponent(shareText)}`;
  const redditUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(addUtm(url, "reddit"))}&title=${encodeURIComponent(title)}`;
  const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText + `\n${addUtm(url, "whatsapp")}`)}`;

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(addUtm(url, "copy_link"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  const handleNativeShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.share({ title, text: shareText, url: addUtm(url, "native_share") });
    } catch { /* user cancelled */ }
    setOpen(false);
  };

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        className="inline-flex items-center justify-center w-5 h-5 rounded opacity-60 hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-white flex-shrink-0"
        title="Share"
        aria-label="Share this headline"
        aria-expanded={open}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
          <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-6 z-50 w-40 rounded-lg border border-dark-200/60 bg-dark-100/95 backdrop-blur-sm shadow-lg py-1 text-xs"
          role="menu"
        >
          {/* X */}
          <a href={xUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-gray-300 hover:text-white transition-colors" role="menuitem">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Share on X
          </a>
          {/* Telegram */}
          <a href={tgUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-gray-300 hover:text-white transition-colors" role="menuitem">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            Telegram
          </a>
          {/* Reddit */}
          <a href={redditUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-gray-300 hover:text-white transition-colors" role="menuitem">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
              <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
            </svg>
            Reddit
          </a>
          {/* WhatsApp */}
          <a href={waUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-gray-300 hover:text-white transition-colors" role="menuitem">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 flex-shrink-0">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
            </svg>
            WhatsApp
          </a>
          {/* Copy link */}
          <button onClick={handleCopy}
            className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-gray-300 hover:text-white transition-colors w-full text-left" role="menuitem">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 flex-shrink-0">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? "Copied!" : "Copy link"}
          </button>
          {/* Native share (mobile) */}
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button onClick={handleNativeShare}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 text-gray-300 hover:text-white transition-colors w-full text-left border-t border-dark-200/30 mt-1 pt-1.5" role="menuitem">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 flex-shrink-0">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              More...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
