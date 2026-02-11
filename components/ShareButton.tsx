"use client";

/**
 * Tiny, subtle share-on-X button that appears on hover next to headlines.
 */
export function ShareButton({ title, url, ticker, pumpUrl }: { title: string; url: string; ticker?: string; pumpUrl?: string }) {
  const lines = [title];
  if (ticker && pumpUrl) {
    lines.push(`\n$${ticker} just launched\n${pumpUrl}`);
  } else if (ticker) {
    lines.push(`\n$${ticker}`);
  }
  lines.push(`\n${url}`);
  const tweetText = encodeURIComponent(lines.join(""));
  const href = `https://twitter.com/intent/tweet?text=${tweetText}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center w-5 h-5 rounded opacity-60 hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-white flex-shrink-0"
      title="Share on X"
      onClick={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    </a>
  );
}
