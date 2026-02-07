/**
 * Custom SVG icons for The McAfee Report.
 * Replaces emojis with on-brand neon/cyber-styled icons.
 */

interface IconProps {
  size?: number;
  className?: string;
}

/** Ghost icon — AI McAfee */
export function GhostIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2C7.58 2 4 5.58 4 10v8.5c0 .83.67 1.5 1.5 1.5s1-1 1.5-1 1 1 1.5 1 1-1 1.5-1 1 1 1.5 1 1-1 1.5-1 1 1 1.5 1 1-1 1.5-1 1 1 1.5 1 .67-1.5.67-1.5V10c0-4.42-3.58-8-8-8z"
        fill="url(#ghost-grad)"
        opacity="0.9"
      />
      <circle cx="9.5" cy="10.5" r="1.5" fill="#fff" opacity="0.9" />
      <circle cx="14.5" cy="10.5" r="1.5" fill="#fff" opacity="0.9" />
      <defs>
        <linearGradient id="ghost-grad" x1="4" y1="2" x2="20" y2="20">
          <stop stopColor="#bf5af2" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Up arrow — WAGMI vote */
export function UpArrowIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </svg>
  );
}

/** Down arrow — NGMI vote */
export function DownArrowIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 5v14" />
      <path d="M19 12l-7 7-7-7" />
    </svg>
  );
}

/** Incoming mail — submission received */
export function InboxIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#00D3FF" strokeWidth="2" className={className}>
      <path d="M22 12l-10 6L2 12" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="2" y="6" width="20" height="14" rx="2" strokeLinecap="round" />
      <path d="M12 2v8" strokeLinecap="round" />
      <path d="M9 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Magnifying glass — validating */
export function SearchIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" className={className}>
      <circle cx="10" cy="10" r="7" />
      <path d="M21 21l-5-5" strokeLinecap="round" />
      <path d="M10 7v6M7 10h6" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

/** Checkmark shield — approved */
export function ApprovedIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M12 2L3 7v6c0 5.25 3.83 10.15 9 11.25 5.17-1.1 9-6 9-11.25V7l-9-5z"
        fill="url(#approved-grad)"
        opacity="0.2"
      />
      <path
        d="M12 2L3 7v6c0 5.25 3.83 10.15 9 11.25 5.17-1.1 9-6 9-11.25V7l-9-5z"
        stroke="#00ff9d"
        strokeWidth="1.5"
      />
      <path d="M8 12l3 3 5-6" stroke="#00ff9d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="approved-grad" x1="3" y1="2" x2="21" y2="20">
          <stop stopColor="#00ff9d" />
          <stop offset="1" stopColor="#00D3FF" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** X circle — rejected */
export function RejectedIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.5" fill="rgba(239,68,68,0.12)" />
      <path d="M15 9l-6 6M9 9l6 6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Coin — token minted */
export function CoinIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="9" fill="url(#coin-grad)" opacity="0.2" />
      <circle cx="12" cy="12" r="9" stroke="url(#coin-grad)" strokeWidth="1.5" />
      <path d="M12 6v12" stroke="#bf5af2" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 9c0 0-1-1.5-3-1.5S9 9 9 9s0 1.5 3 2 3 2 3 2-1 1.5-3 1.5-3-1.5-3-1.5" stroke="#bf5af2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="coin-grad" x1="3" y1="3" x2="21" y2="21">
          <stop stopColor="#bf5af2" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** Newspaper — headline published */
export function PublishIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="#00D3FF" strokeWidth="1.5" fill="rgba(0,211,255,0.08)" />
      <path d="M7 7h10M7 11h6M7 15h8" stroke="#00D3FF" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="17" cy="14" r="2" fill="#00D3FF" opacity="0.4" />
    </svg>
  );
}

/** Ballot — vote cast */
export function VoteIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="4" y="11" width="16" height="10" rx="2" stroke="#6366f1" strokeWidth="1.5" fill="rgba(99,102,241,0.1)" />
      <path d="M12 3l3 5H9l3-5z" fill="#6366f1" opacity="0.6" />
      <path d="M12 8v5" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 14h8" stroke="#6366f1" strokeWidth="1" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}

/** Clipboard — default/fallback */
export function ClipboardIcon({ size = 14, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" className={className}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 2h6v3H9z" fill="#9ca3af" opacity="0.3" stroke="none" />
      <rect x="9" y="2" width="6" height="3" rx="1" />
      <path d="M9 10h6M9 14h4" strokeLinecap="round" />
    </svg>
  );
}
