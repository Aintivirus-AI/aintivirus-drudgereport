"use client";

import { useTokenPrices } from "@/hooks/useTokenPrices";

export function TopCoinsRibbon() {
  const prices = useTokenPrices();

  // Sort tokens by 24h price change descending (top performers first), limit to 20
  const topCoins = Object.values(prices)
    .filter((t) => t.ticker && typeof t.priceChange24h === "number")
    .sort((a, b) => b.priceChange24h - a.priceChange24h)
    .slice(0, 20);

  if (topCoins.length === 0) return null;

  // Build the pump.fun fallback URL from mint address
  const getPumpLink = (coin: (typeof topCoins)[number]) =>
    coin.pumpUrl || `https://pump.fun/coin/${coin.mintAddress}`;

  // Render the list twice for seamless looping
  const renderCoins = (keyPrefix: string) =>
    topCoins.map((coin, i) => {
      const href = getPumpLink(coin);

      return (
        <span key={`${keyPrefix}-${i}`} className="ribbon-coin">
          <span className="ribbon-rank">#{i + 1}</span>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="ribbon-link"
          >
            {coin.imageUrl && (
              <img
                src={coin.imageUrl}
                alt={coin.ticker}
                className="ribbon-logo"
                loading="lazy"
              />
            )}
            <span className="ribbon-ticker">${coin.ticker}</span>
          </a>
          <span
            className={
              coin.priceChange24h >= 0
                ? "ribbon-change ribbon-change-up"
                : "ribbon-change ribbon-change-down"
            }
          >
            {coin.priceChange24h >= 0 ? "▲" : "▼"}{" "}
            {Math.abs(coin.priceChange24h).toFixed(1)}%
          </span>
          {coin.marketCap != null && (
            <span className="ribbon-mcap">
              MC: ${formatCompact(coin.marketCap)}
            </span>
          )}
          <span className="ribbon-separator">│</span>
        </span>
      );
    });

  return (
    <div className="top-coins-ribbon" aria-label="Top performing coins">
      <div className="ribbon-track">
        <div className="ribbon-content">
          {renderCoins("a")}
          {renderCoins("b")}
        </div>
      </div>
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}
