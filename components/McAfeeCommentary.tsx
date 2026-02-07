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
 */
interface McAfeeTooltipProps {
  take: string;
  children: React.ReactNode;
}

export function McAfeeTooltip({ take, children }: McAfeeTooltipProps) {
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
          <span className="mcafee-tooltip-text">{take}</span>
        </div>
      )}
    </div>
  );
}
