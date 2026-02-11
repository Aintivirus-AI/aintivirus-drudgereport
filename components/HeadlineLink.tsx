import type { Headline } from "@/lib/types";
import { TokenBadge, TokenBadgeCompact } from "./TokenBadge";
import { ShareButton } from "./ShareButton";
import { ArticleButton } from "./ArticleButton";
import { VoteButtons } from "./VoteButtons";
import { McAfeeTooltip } from "./McAfeeCommentary";

interface HeadlineLinkProps {
  headline: Headline;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export function HeadlineLink({ headline }: HeadlineLinkProps) {
  const articlePath = `/article/${headline.id}`;
  const articleUrl = `${SITE_URL}${articlePath}`;

  // If there's an image, show a card-style layout
  if (headline.image_url) {
    const isCotdCard = headline.title.startsWith("Coin Of The Day:");

    return (
      <li className="py-2">
        <div className="block group">
          <div className="flex gap-3 items-start">
            <div className="flex-shrink-0 w-16 h-16 rounded overflow-hidden border border-dark-200 relative">
              <a
                href={headline.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={headline.image_url}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                />
              </a>
              {/* Token badge overlay on image */}
              {headline.token && (
                <div className="absolute top-1 right-1">
                  <TokenBadgeCompact 
                    pumpUrl={headline.token.pump_url} 
                    ticker={headline.token.ticker}
                  />
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              {/* Row 1: Headline text */}
              {headline.mcafee_take ? (
                <McAfeeTooltip take={headline.mcafee_take} articleUrl={articlePath}>
                  <a
                    href={headline.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="neon-link text-sm hover:underline leading-tight"
                  >
                    {headline.title}
                  </a>
                </McAfeeTooltip>
              ) : (
                <a
                  href={headline.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neon-link text-sm hover:underline leading-tight"
                >
                  {headline.title}
                </a>
              )}
              {/* Row 2: Badge + action buttons */}
              <div className="flex flex-wrap items-center gap-1">
                {isCotdCard ? (
                  <a
                    href={articlePath}
                    className="cotd-badge headline-badge-uniform inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-semibold"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 flex-shrink-0">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Coin of the Day
                  </a>
                ) : headline.token ? (
                  <span className="headline-badge-uniform inline-flex">
                    <TokenBadge 
                      pumpUrl={headline.token.pump_url} 
                      ticker={headline.token.ticker}
                      imageUrl={headline.token.image_url}
                      priceChange={headline.token.price_change_24h}
                      size="sm"
                    />
                  </span>
                ) : null}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <VoteButtons headlineId={headline.id} compact />
                  <ArticleButton url={articlePath} />
                  <ShareButton
                    title={headline.title}
                    url={articleUrl}
                    ticker={headline.token?.ticker}
                    pumpUrl={headline.token?.pump_url}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </li>
    );
  }

  // Detect Coin of the Day articles
  const isCotd = headline.title.startsWith("Coin Of The Day:");

  // Default text-only layout
  return (
    <li className="headline-bullet py-1 group">
      <div className="flex flex-col gap-1">
        {/* Row 1: Headline text */}
        {headline.mcafee_take ? (
          <McAfeeTooltip take={headline.mcafee_take} articleUrl={articlePath}>
            <a
              href={headline.url}
              target="_blank"
              rel="noopener noreferrer"
              className="neon-link text-sm hover:underline"
            >
              {headline.title}
            </a>
          </McAfeeTooltip>
        ) : (
          <a
            href={headline.url}
            target="_blank"
            rel="noopener noreferrer"
            className="neon-link text-sm hover:underline"
          >
            {headline.title}
          </a>
        )}
        {/* Row 2: Badge + action buttons */}
        <div className="flex flex-wrap items-center gap-1">
          {isCotd ? (
            <a
              href={articlePath}
              className="cotd-badge headline-badge-uniform inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full font-semibold"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 flex-shrink-0">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Coin of the Day
            </a>
          ) : headline.token ? (
            <span className="headline-badge-uniform inline-flex">
              <TokenBadge 
                pumpUrl={headline.token.pump_url} 
                ticker={headline.token.ticker}
                imageUrl={headline.token.image_url}
                priceChange={headline.token.price_change_24h}
                showTicker={false}
                size="sm"
              />
            </span>
          ) : null}
          <div className="flex items-center gap-1 flex-shrink-0">
            <VoteButtons headlineId={headline.id} compact />
            <ArticleButton url={articlePath} />
            <ShareButton
              title={headline.title}
              url={articleUrl}
              ticker={headline.token?.ticker}
              pumpUrl={headline.token?.pump_url}
            />
          </div>
        </div>
      </div>
    </li>
  );
}
