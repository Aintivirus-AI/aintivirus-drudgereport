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
              <div className="flex items-start gap-1">
                {headline.mcafee_take ? (
                  <McAfeeTooltip take={headline.mcafee_take}>
                    <a
                      href={headline.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="neon-link text-sm hover:underline leading-tight flex-1"
                      title={headline.title}
                    >
                      {headline.title}
                    </a>
                  </McAfeeTooltip>
                ) : (
                  <a
                    href={headline.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="neon-link text-sm hover:underline leading-tight flex-1"
                    title={headline.title}
                  >
                    {headline.title}
                  </a>
                )}
                <VoteButtons headlineId={headline.id} compact />
                <ArticleButton url={articlePath} />
                <ShareButton
                  title={headline.title}
                  url={articleUrl}
                  ticker={headline.token?.ticker}
                />
              </div>
              {/* Token badge below title for cards */}
              {headline.token && (
                <TokenBadge 
                  pumpUrl={headline.token.pump_url} 
                  ticker={headline.token.ticker}
                  priceChange={headline.token.price_change_24h}
                  size="sm"
                />
              )}
            </div>
          </div>
        </div>
      </li>
    );
  }

  // Default text-only layout
  return (
    <li className="headline-bullet py-1 flex items-center gap-2 group">
      {headline.mcafee_take ? (
        <McAfeeTooltip take={headline.mcafee_take}>
          <a
            href={headline.url}
            target="_blank"
            rel="noopener noreferrer"
            className="neon-link text-sm hover:underline flex-1"
            title={headline.title}
          >
            {headline.title}
          </a>
        </McAfeeTooltip>
      ) : (
        <a
          href={headline.url}
          target="_blank"
          rel="noopener noreferrer"
          className="neon-link text-sm hover:underline flex-1"
          title={headline.title}
        >
          {headline.title}
        </a>
      )}
      <VoteButtons headlineId={headline.id} compact />
      <ArticleButton url={articlePath} />
      <ShareButton
        title={headline.title}
        url={articleUrl}
        ticker={headline.token?.ticker}
      />
      {/* Inline token badge for text-only headlines */}
      {headline.token && (
        <TokenBadge 
          pumpUrl={headline.token.pump_url} 
          ticker={headline.token.ticker}
          priceChange={headline.token.price_change_24h}
          showTicker={false}
          size="sm"
        />
      )}
    </li>
  );
}
