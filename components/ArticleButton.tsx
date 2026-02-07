"use client";

/**
 * Tiny article-page link that appears on hover next to headlines.
 * Matches the same hover pattern as ShareButton.
 */
export function ArticleButton({ url }: { url: string }) {
  return (
    <a
      href={url}
      className="inline-flex items-center justify-center w-5 h-5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity duration-200 text-gray-400 hover:text-neon-cyan flex-shrink-0"
      title="View article page"
      onClick={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="16" y1="13" x2="8" y2="13" strokeLinecap="round"/>
        <line x1="16" y1="17" x2="8" y2="17" strokeLinecap="round"/>
      </svg>
    </a>
  );
}
