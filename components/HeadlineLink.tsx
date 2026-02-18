import Image from "next/image";
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

// X/Twitter logo SVG for tweet headlines without images
const XLogo = () => (
  <div className="w-full h-full flex items-center justify-center bg-dark-100 rounded">
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-gray-400">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
    </svg>
  </div>
);

export function HeadlineLink({ headline }: HeadlineLinkProps) {
  const articlePath = `/article/${headline.id}`;
  const articleUrl = `${SITE_URL}${articlePath}`;
  const isTweet = headline.url.includes("twitter.com") || headline.url.includes("x.com");

  // If there's an image OR it's a tweet (show X logo), use card-style layout
  if (headline.image_url || isTweet) {
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
                {headline.image_url ? (
                  <Image
                    src={headline.image_url}
                    alt={headline.title}
                    width={64}
                    height={64}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                    loading="lazy"
                  />
                ) : (
                  <XLogo />
                )}
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
