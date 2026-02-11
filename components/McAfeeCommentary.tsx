"use client";

import { useState, useEffect, useRef } from "react";
import { GhostIcon } from "./Icons";

interface McAfeeCommentaryProps {
  take: string;
  /** Compact mode for tooltips/inline */
  compact?: boolean;
}

export function McAfeeCommentary({ take, compact = false }: McAfeeCommentaryProps) {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || compact) {
      setDisplayedText(take);
      setIsComplete(true);
      return;
    }

    // Typewriter effect
    hasAnimated.current = true;
    let index = 0;
    const interval = setInterval(() => {
      if (index < take.length) {
        setDisplayedText(take.slice(0, index + 1));
        index++;
      } else {
        setIsComplete(true);
        clearInterval(interval);
      }
    }, 25);

    return () => clearInterval(interval);
  }, [take, compact]);

  if (compact) {
    return (
      <div className="mcafee-compact">
        <GhostIcon size={16} />
        <span className="mcafee-compact-text">{take}</span>
      </div>
    );
  }

  return (
    <div className="mcafee-commentary" ref={containerRef}>
      <div className="mcafee-header">
        <GhostIcon size={22} />
        <span className="mcafee-attribution">AI McAfee</span>
        <div className="mcafee-header-line" />
      </div>
      <blockquote className="mcafee-quote">
        <p>
          {displayedText}
          {!isComplete && <span className="mcafee-cursor">|</span>}
        </p>
      </blockquote>
    </div>
  );
}

/**
 * Tooltip wrapper for McAfee takes on headline links.
 * Optionally shows a "Dive Deeper" link to the article page.
 */
interface McAfeeTooltipProps {
  take: string;
  articleUrl?: string;
  children: React.ReactNode;
}

export function McAfeeTooltip({ take, articleUrl, children }: McAfeeTooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="mcafee-tooltip-wrapper"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="mcafee-tooltip">
          <GhostIcon size={18} />
          <div className="mcafee-tooltip-body">
            <span className="mcafee-tooltip-text">{take}</span>
            {articleUrl && (
              <a href={articleUrl} className="mcafee-tooltip-dive" onClick={(e) => e.stopPropagation()}>
                Dive Deeper
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mcafee-tooltip-dive-icon">
                  <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
