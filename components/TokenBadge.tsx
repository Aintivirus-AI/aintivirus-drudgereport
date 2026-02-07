"use client";

import { useRef, useEffect, useState } from "react";
import { useTickerPrice } from "@/hooks/useTokenPrices";

interface TokenBadgeProps {
  pumpUrl: string;
  ticker: string;
  priceChange?: number;
  showTicker?: boolean;
  size?: "sm" | "md";
}

export function TokenBadge({ 
  pumpUrl, 
  ticker, 
  priceChange: initialPriceChange, 
  showTicker = true,
  size = "sm" 
}: TokenBadgeProps) {
  // Pull live price from the shared poller; fall back to the server-rendered prop
  const livePrice = useTickerPrice(ticker);
  const priceChange = livePrice?.priceChange24h ?? initialPriceChange;

  // Flash animation on price change
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prevPrice = useRef(priceChange);

  useEffect(() => {
    if (priceChange === undefined || prevPrice.current === undefined) {
      prevPrice.current = priceChange;
      return;
    }
    if (priceChange !== prevPrice.current) {
      setFlash(priceChange > prevPrice.current ? "up" : "down");
      prevPrice.current = priceChange;
      const timer = setTimeout(() => setFlash(null), 1200);
      return () => clearTimeout(timer);
    }
  }, [priceChange]);

  // Determine if price is up or down
  const isUp = priceChange !== undefined && priceChange >= 0;
  const isDown = priceChange !== undefined && priceChange < 0;
  
  // Size classes
  const sizeClasses = size === "sm" 
    ? "text-xs px-1.5 py-0.5 gap-1" 
    : "text-sm px-2 py-1 gap-1.5";
  
  const iconSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";

  // Flash classes
  const flashClass = flash === "up"
    ? "animate-flash-green"
    : flash === "down"
      ? "animate-flash-red"
      : "";
  
  const stateClass = isUp
    ? "token-badge-up"
    : isDown
      ? "token-badge-down"
      : "token-badge-neutral";

  return (
    <a
      href={pumpUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        token-badge ${stateClass}
        inline-flex items-center ${sizeClasses}
        rounded-full font-mono font-medium
        transition-all duration-200
        hover:scale-105 hover:shadow-lg
        ${flashClass}
      `}
      title={`Trade $${ticker} on pump.fun`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Pump.fun icon */}
      <svg 
        viewBox="0 0 24 24" 
        fill="currentColor" 
        className={iconSize}
      >
        <path d="M12.5 2.5c-.28-.28-.72-.28-1 0l-3.54 3.54c-.28.28-.28.72 0 1s.72.28 1 0L11 5v5H6l2.04-2.04c.28-.28.28-.72 0-1s-.72-.28-1 0L3.5 10.5c-.28.28-.28.72 0 1l3.54 3.54c.28.28.72.28 1 0s.28-.72 0-1L6 12h5v5l-2.04-2.04c-.28-.28-.72-.28-1 0s-.28.72 0 1l3.54 3.54c.28.28.72.28 1 0l3.54-3.54c.28-.28.28-.72 0-1s-.72-.28-1 0L13 17v-5h5l-2.04 2.04c-.28.28-.28.72 0 1s.72.28 1 0l3.54-3.54c.28-.28.28-.72 0-1l-3.54-3.54c-.28-.28-.72-.28-1 0s-.28.72 0 1L18 10h-5V5l2.04 2.04c.28.28.72.28 1 0s.28-.72 0-1L12.5 2.5z"/>
      </svg>
      
      {/* Ticker */}
      {showTicker && (
        <span className="font-bold">${ticker}</span>
      )}
      
      {/* Price change indicator */}
      {priceChange !== undefined && (
        <span className="flex items-center">
          {isUp ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className={`${iconSize} token-badge-arrow-up`}>
              <path d="M7 14l5-5 5 5H7z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor" className={`${iconSize} token-badge-arrow-down`}>
              <path d="M7 10l5 5 5-5H7z"/>
            </svg>
          )}
          <span className={size === "sm" ? "text-[10px]" : "text-xs"}>
            {Math.abs(priceChange).toFixed(1)}%
          </span>
        </span>
      )}
    </a>
  );
}

/**
 * Compact token badge for inline use (just the icon)
 */
export function TokenBadgeCompact({ pumpUrl, ticker }: { pumpUrl: string; ticker: string }) {
  return (
    <a
      href={pumpUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="token-badge-compact inline-flex items-center justify-center w-5 h-5 rounded-full transition-colors"
      title={`Trade $${ticker} on pump.fun`}
      onClick={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
        <path d="M12.5 2.5c-.28-.28-.72-.28-1 0l-3.54 3.54c-.28.28-.28.72 0 1s.72.28 1 0L11 5v5H6l2.04-2.04c.28-.28.28-.72 0-1s-.72-.28-1 0L3.5 10.5c-.28.28-.28.72 0 1l3.54 3.54c.28.28.72.28 1 0s.28-.72 0-1L6 12h5v5l-2.04-2.04c-.28-.28-.72-.28-1 0s-.28.72 0 1l3.54 3.54c.28.28.72.28 1 0l3.54-3.54c.28-.28.28-.72 0-1s-.72-.28-1 0L13 17v-5h5l-2.04 2.04c-.28.28-.28.72 0 1s.72.28 1 0l3.54-3.54c.28-.28.28-.72 0-1l-3.54-3.54c-.28-.28-.72-.28-1 0s-.28.72 0 1L18 10h-5V5l2.04 2.04c.28.28.72.28 1 0s.28-.72 0-1L12.5 2.5z"/>
      </svg>
    </a>
  );
}
