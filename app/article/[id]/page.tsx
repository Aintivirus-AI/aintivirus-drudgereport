import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getHeadlineWithDetails } from "@/lib/db";
import { TokenBadge } from "@/components/TokenBadge";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { CopyAddressButton } from "@/components/CopyAddressButton";
import { ListenButton } from "@/components/ListenButton";
import { TimeAgo } from "@/components/TimeAgo";
import { McAfeeCommentary } from "@/components/McAfeeCommentary";
import { VoteButtons } from "@/components/VoteButtons";
import { SubmitCTA } from "@/components/SubmitCTA";
import { ThemeToggle } from "@/components/ThemeToggle";

export const revalidate = 30;

interface ArticlePageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { id } = await params;
  const article = getHeadlineWithDetails(parseInt(id, 10));
  if (!article) return { title: "Article Not Found" };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const ogImageUrl = `${siteUrl}/api/og/${id}`;

  const description = article.token
    ? `$${article.token.ticker} token launched for this story. Trade on pump.fun. Powered by The McAfee Report.`
    : "Breaking news on The McAfee Report. Powered by AintiVirus.";

  return {
    title: `${article.title} | The McAfee Report`,
    description,
    openGraph: {
      title: article.title,
      description,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { id } = await params;
  const article = getHeadlineWithDetails(parseInt(id, 10));
  if (!article) notFound();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const articleUrl = `${siteUrl}/article/${article.id}`;
  const tweetText = encodeURIComponent(
    `${article.title}${article.token ? ` $${article.token.ticker}` : ""} via @officialmcafee`
  );
  const telegramShareUrl = encodeURIComponent(articleUrl);

  const publishedDate = new Date(article.created_at);

  return (
    <main className="main-content">
      <div className="min-h-screen grid-bg">
      {/* Header bar */}
      <div className="border-b border-dark-200/30 py-4">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <a href="/" className="text-neon-cyan hover:underline text-sm font-mono">
              &larr; Back to The McAfee Report
            </a>
            <div className="flex items-center gap-3">
              <TimeAgo date={article.created_at} />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Hero image */}
        {article.image_url && (
          <div className="rounded-lg overflow-hidden border border-dark-200/30 mb-8">
            <img
              src={article.image_url}
              alt={article.title}
              className="w-full h-auto max-h-96 object-cover"
            />
          </div>
        )}

        {/* Headline */}
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-red-500 leading-tight mb-4">
          {article.title}
        </h1>

        {/* AI McAfee Commentary */}
        {article.mcafee_take && (
          <div className="mb-6">
            <McAfeeCommentary take={article.mcafee_take} />
          </div>
        )}

        {/* WAGMI/NGMI Voting */}
        <div className="mb-6">
          <VoteButtons headlineId={article.id} />
        </div>

        {/* Meta info */}
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400 mb-8">
          {article.submitter_wallet && (
            <span>Submitted by {article.submitter_wallet.slice(0, 4)}...{article.submitter_wallet.slice(-4)}</span>
          )}
          <span>{publishedDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neon-cyan hover:underline"
          >
            Read source &rarr;
          </a>
        </div>

        {/* Article Summary — use headline summary (COTD) or cached_content (regular articles) */}
        {(() => {
          let summary: string | null = article.summary || null;
          if (!summary && article.cached_content) {
            try {
              const parsed = JSON.parse(article.cached_content);
              summary = parsed.description || (parsed.content ? parsed.content.slice(0, 500) : null);
            } catch {
              // Invalid JSON — skip
            }
          }
          if (!summary) return null;

          // COTD summaries are multi-paragraph; split into paragraphs for proper rendering
          const paragraphs = summary.split(/\n\n+/).filter(Boolean);

          return (
            <div className="article-summary mb-8">
              <div className="article-summary-header">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-neon-cyan">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
                  <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round"/>
                  <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round"/>
                  <line x1="10" y1="9" x2="8" y2="9" strokeLinecap="round"/>
                </svg>
                <span className="text-sm font-semibold text-white tracking-wide">SUMMARY</span>
                <ListenButton text={summary} />
              </div>
              <div className="article-summary-text">
                {paragraphs.map((p, i) => (
                  <p key={i} className={i < paragraphs.length - 1 ? "mb-4" : ""}>{p}</p>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Go to Project button */}
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-6 py-3 mb-8 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 hover:bg-neon-cyan/20 hover:border-neon-cyan/50 transition-all text-neon-cyan font-semibold text-sm"
        >
          Go to Project
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M7 17L17 7M17 7H7M17 7v10" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>

        {/* Token Section */}
        {article.token && (
          <div className="border border-neon-cyan/30 rounded-lg p-6 mb-8 bg-dark-100/50">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              {/* Token image */}
              {article.token_image_url && (
                <img
                  src={article.token_image_url}
                  alt={article.token_name || article.token.ticker}
                  className="w-20 h-20 rounded-full border-2 border-neon-cyan/30"
                />
              )}

              <div className="flex-1">
                <h2 className="text-xl font-bold text-white">
                  {article.token_name || `$${article.token.ticker}`}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-gray-400 text-sm font-mono">
                    ${article.token.ticker}
                  </span>
                  {article.mint_address && (
                    <CopyAddressButton address={article.mint_address} />
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <TokenBadge
                  pumpUrl={article.token.pump_url}
                  ticker={article.token.ticker}
                  priceChange={article.token.price_change_24h}
                  size="md"
                />
              </div>
            </div>

            {/* Pump.fun chart link */}
            {article.mint_address && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(article.mint_address) && (
              <a
                href={`https://pump.fun/coin/${article.mint_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 flex items-center justify-center gap-3 rounded-lg border border-dark-200/30 bg-black/40 hover:bg-black/60 hover:border-neon-cyan/30 transition-all py-6 group"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-6 h-6 text-neon-cyan opacity-70 group-hover:opacity-100 transition-opacity">
                  <path d="M3 3v18h18" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M7 16l4-8 4 4 5-9" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-gray-400 group-hover:text-white transition-colors text-sm font-medium">
                  View live chart on pump.fun
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gray-600 group-hover:text-neon-cyan transition-colors">
                  <path d="M7 17L17 7M17 7H7M17 7v10" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </a>
            )}

            <p className="text-xs text-gray-500 mt-4">
              50% of creator fees go to the submitter. 50% buy and burn $NEWS.
            </p>
          </div>
        )}

        {/* Social Share */}
        <div className="flex flex-wrap gap-3 mb-8">
          <a
            href={`https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(articleUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-100 border border-dark-200/50 hover:border-white/30 transition-colors text-sm"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            Share on X
          </a>
          <a
            href={`https://t.me/share/url?url=${telegramShareUrl}&text=${tweetText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-100 border border-dark-200/50 hover:border-cyan-500/30 transition-colors text-sm"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            Share on Telegram
          </a>
          <CopyLinkButton url={articleUrl} />
        </div>

        {/* How to Earn CTA */}
        <div className="border-t border-dark-200/30 pt-8">
          <SubmitCTA />
        </div>
      </div>
      </div>
    </main>
  );
}

