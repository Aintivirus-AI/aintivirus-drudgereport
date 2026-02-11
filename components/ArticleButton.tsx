"use client";

/**
 * Tiny article-page link that appears on hover next to headlines.
 * Matches the same hover pattern as ShareButton.
 * Uses an arrow-circle icon to distinguish from the copy/share buttons.
 */
export function ArticleButton({ url }: { url: string }) {
  return (
    <a
      href={url}
      className="inline-flex items-center justify-center w-5 h-5 rounded opacity-60 hover:opacity-100 transition-opacity duration-200 text-gray-400 hover:text-neon-cyan flex-shrink-0"
      title="View article page"
      onClick={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
        <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="8" y1="12" x2="16" y2="12" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </a>
  );
}
