"use client";

import { useSyncExternalStore } from "react";

interface TokenPrice {
  mintAddress: string;
  ticker: string;
  price: number;
  priceChange24h: number;
  marketCap?: number;
  volume24h?: number;
  imageUrl?: string;
  pumpUrl?: string;
}

interface TokenPriceMap {
  [ticker: string]: TokenPrice;
}

const POLL_INTERVAL_MS = 30_000; // 30 seconds (reduced from 20s to cut network traffic)

/**
 * Global shared price store so all TokenBadge components share one poll.
 * Uses useSyncExternalStore to prevent tearing in React 18+ concurrent mode.
 */
let globalPrices: TokenPriceMap = {};
let globalListeners: Set<() => void> = new Set();
let pollTimer: ReturnType<typeof setInterval> | null = null;
let isPolling = false;
let lastFetchTimestamp: number = 0;
let lastFetchError: string | null = null;

function notifyListeners() {
  globalListeners.forEach((fn) => fn());
}

async function fetchPrices() {
  if (isPolling) return;
  isPolling = true;

  try {
    const res = await fetch("/api/token-prices", { cache: "no-store" });
    if (!res.ok) {
      lastFetchError = `HTTP ${res.status}`;
      return;
    }
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) {
      lastFetchError = "Invalid response format";
      return;
    }

    const newPrices: TokenPriceMap = {};
    for (const token of json.data as TokenPrice[]) {
      newPrices[token.ticker] = token;
    }
    globalPrices = newPrices;
    lastFetchTimestamp = Date.now();
    lastFetchError = null;
    notifyListeners();
  } catch (err) {
    lastFetchError = err instanceof Error ? err.message : "Fetch failed";
    // Don't wipe prices — keep stale data as fallback
    console.warn("[useTokenPrices] Fetch failed:", lastFetchError);
  } finally {
    isPolling = false;
  }
}

function startPolling() {
  if (pollTimer) return;
  // Fetch immediately, then on interval
  fetchPrices();
  pollTimer = setInterval(fetchPrices, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// Pause polling when tab is hidden to save battery and bandwidth
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopPolling();
    } else if (globalListeners.size > 0) {
      startPolling();
    }
  });
}

// useSyncExternalStore API: subscribe function
function subscribe(onStoreChange: () => void): () => void {
  globalListeners.add(onStoreChange);

  // Start polling when first listener subscribes
  if (globalListeners.size === 1) {
    startPolling();
  }

  return () => {
    globalListeners.delete(onStoreChange);
    // Stop polling when last listener unsubscribes
    if (globalListeners.size === 0) {
      stopPolling();
    }
  };
}

// useSyncExternalStore API: getSnapshot function
function getSnapshot(): TokenPriceMap {
  return globalPrices;
}

// useSyncExternalStore API: getServerSnapshot function (for SSR)
// IMPORTANT: Must return the SAME reference every call — React checks with ===.
// Returning a new `{}` each time causes "getServerSnapshot not consistent" error.
const EMPTY_PRICES: TokenPriceMap = {};
function getServerSnapshot(): TokenPriceMap {
  return EMPTY_PRICES;
}

/**
 * Hook that returns live token prices from a shared global poller.
 * All components using this hook share a single fetch interval.
 * Uses useSyncExternalStore to prevent tearing in React concurrent mode.
 */
export function useTokenPrices(): TokenPriceMap {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Hook that returns the live price for a single ticker.
 * Returns undefined if no price data is available.
 */
export function useTickerPrice(ticker: string): TokenPrice | undefined {
  const prices = useTokenPrices();
  return prices[ticker];
}

/**
 * Get staleness info for the price data.
 */
export function usePriceStaleness(): {
  lastUpdated: number;
  isStale: boolean;
  error: string | null;
} {
  const prices = useTokenPrices(); // subscribe to updates
  return {
    lastUpdated: lastFetchTimestamp,
    isStale: lastFetchTimestamp > 0 && Date.now() - lastFetchTimestamp > POLL_INTERVAL_MS * 3,
    error: lastFetchError,
  };
}
