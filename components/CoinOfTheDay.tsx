import type { CoinOfTheDayData } from "@/lib/types";

interface CoinOfTheDayProps {
  coin: CoinOfTheDayData | null;
}

export function CoinOfTheDay({ coin }: CoinOfTheDayProps) {
  if (!coin) {
    return null;
  }

  return (
    <div className="cotd-card mb-6">
      <div className="cotd-header">
        <div className="cotd-header-deco cotd-header-deco-left" />
        <span className="cotd-star">&#9733;</span>
        <span className="cotd-title">COIN OF THE DAY</span>
        <span className="cotd-star">&#9733;</span>
        <div className="cotd-header-deco cotd-header-deco-right" />
      </div>
      
      <a
        href={coin.url}
        target="_blank"
        rel="noopener noreferrer"
        className="cotd-link group"
      >
        {coin.image_url && (
          <div className="cotd-image-wrapper">
            <img
              src={coin.image_url}
              alt={coin.title}
              className="cotd-image group-hover:scale-105 transition-transform duration-300"
            />
          </div>
        )}
        
        <div className="cotd-content">
          <h3 className="cotd-coin-name">
            {coin.title}
          </h3>
          
          {coin.description && (
            <p className="cotd-description">
              {coin.description}
            </p>
          )}
        </div>
      </a>
    </div>
  );
}
