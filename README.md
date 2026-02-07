# THE MCAFEE REPORT

A Drudge Report-style crypto news aggregator powered by AintiVirus. Users submit breaking news via Telegram, AI validates and generates headlines, and each published story automatically launches a token on pump.fun with revenue sharing.

## Features

### Core

- **Drudge Report layout** — Three-column design with main headline spotlight, hot topics, and Coin of the Day
- **Public submissions** — Anyone can submit news via Telegram bot and earn rewards
- **AI validation** — Fact-checking, freshness detection, and duplicate detection via GPT-4o-mini
- **Auto token launches** — Each published headline deploys a token on pump.fun
- **Revenue sharing** — 50% of creator fees to submitter, 50% buy-and-burn $NEWS
- **Scheduler** — Automated validation and publishing with fair user interleaving

### Viral Features

- **Breaking News Siren** — AI scores headline importance (0-100); score 80+ triggers a flashing animated banner with Web Audio siren
- **AI McAfee Commentary** — Every headline gets a GPT-generated one-liner hot take in McAfee's voice, shown on article pages and as hover tooltips
- **WAGMI/NGMI Voting** — Community binary voting on every headline with optimistic UI updates and a global sentiment meter on the homepage
- **Live War Room** — Real-time activity feed at the bottom of the homepage showing submissions, validations, token mints, and votes
- **Dynamic OG Share Cards** — Auto-generated 1200x630 branded images for social sharing via Next.js ImageResponse

### Other

- **Dark/light theme** toggle (content area only)
- **Token ticker** with live price updates via pump.fun/DexScreener APIs
- **Top coins scrolling ribbon**
- **Leaderboard** — Top submitters and recent token launches
- **Auto-tweet** — Published articles post to Twitter/X
- **Article detail pages** with token info, summary, McAfee take, voting, and social sharing

## Quick Start

### Prerequisites

- Node.js 20+
- OpenAI API key
- Telegram bot token (from [@BotFather](https://t.me/BotFather))

### 1. Install

```bash
npm install
```

### 2. Configure

Copy `.env.example` to `.env.local` and set the required values:

```bash
cp .env.example .env.local
```

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather |
| `ADMIN_TELEGRAM_IDS` | Comma-separated admin Telegram user IDs |
| `API_SECRET_KEY` | Random secret for API authentication |
| `NEXT_PUBLIC_SITE_URL` | Public URL of the site |
| `OPENAI_API_KEY` | OpenAI API key (GPT-4o-mini, gpt-image-1) |

Optional for token deployment:

| Variable | Description |
|----------|-------------|
| `DEPLOYER_PRIVATE_KEY` | Solana wallet private key (base58) |
| `SOLANA_RPC_URL` | Solana RPC endpoint |
| `HELIUS_API_KEY` | Helius API key for webhooks |
| `TWITTER_API_KEY` | Twitter API credentials (4 keys) |

### 3. Run

```bash
# Terminal 1 — Website
npm run dev

# Terminal 2 — Telegram bot
npm run bot

# Terminal 3 — Scheduler worker
npm run scheduler
```

Open [http://localhost:3000](http://localhost:3000).

## Telegram Bot Commands

### Public

| Command | Description |
|---------|-------------|
| `/submit` | Submit a news link (earn rewards if published) |
| `/mystatus` | View your submission history and status |
| `/cancel` | Cancel current operation |

### Editor (whitelisted users)

| Command | Description |
|---------|-------------|
| `/add` | Add headline — AI generates options from URL |
| `/main` | Set the main/center headline |
| `/cotd` | Set Coin of the Day (no token created) |
| `/list` | View recent headlines with IDs |
| `/remove <id>` | Remove a headline |

### Admin

| Command | Description |
|---------|-------------|
| `/whitelist` | View whitelisted users |
| `/adduser <id> [username]` | Add user to whitelist |
| `/removeuser <id>` | Remove from whitelist |
| `/queue` | View submission queue status |

## Project Structure

```
aintivirus-drudgereport/
├── app/                          # Next.js 15 App Router
│   ├── api/
│   │   ├── coin-of-the-day/     # Coin of the Day CRUD
│   │   ├── headlines/           # Headlines CRUD
│   │   ├── main-headline/       # Main headline API
│   │   ├── og/[id]/             # Dynamic OG share card images
│   │   ├── submissions/         # Submission management
│   │   ├── token-prices/        # Token price fetching (cached)
│   │   ├── votes/               # WAGMI/NGMI voting API
│   │   ├── war-room/            # Live activity feed API
│   │   ├── scheduler/trigger/   # Manual scheduler trigger
│   │   └── webhooks/helius/     # Revenue webhook handler
│   ├── article/[id]/            # Article detail pages
│   ├── leaderboard/             # Leaderboard page
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Homepage
│   └── globals.css              # All styles
├── bot/
│   └── index.ts                 # Telegram bot
├── worker/
│   └── scheduler.ts             # Background scheduler process
├── components/
│   ├── BreakingSiren.tsx        # Breaking news siren animation
│   ├── McAfeeCommentary.tsx     # AI McAfee hot take display
│   ├── VoteButtons.tsx          # WAGMI/NGMI voting (full + compact)
│   ├── SentimentMeter.tsx       # Global sentiment bar
│   ├── WarRoomFeed.tsx          # Live activity feed
│   ├── Icons.tsx                # Custom SVG icon set
│   ├── MainHeadline.tsx         # Center headline card
│   ├── HeadlineColumn.tsx       # Left/right headline columns
│   ├── HeadlineLink.tsx         # Individual headline with token/vote
│   ├── CoinOfTheDay.tsx         # Featured coin card
│   ├── TokenTicker.tsx          # $NEWS ticker bar
│   ├── TokenBadge.tsx           # Token price badge with logo
│   ├── TopCoinsRibbon.tsx       # Scrolling top coins
│   ├── ThemeToggle.tsx          # Dark/light toggle
│   └── ...                      # Share, copy, listen buttons
├── lib/
│   ├── db.ts                    # SQLite database (schema + CRUD)
│   ├── types.ts                 # TypeScript types
│   ├── scheduler.ts             # Publishing scheduler logic
│   ├── ai-validator.ts          # AI validation (fact, freshness, dupe)
│   ├── mcafee-commentator.ts    # AI McAfee takes + importance scoring
│   ├── activity-logger.ts       # War Room activity logging
│   ├── token-generator.ts       # AI token metadata + image generation
│   ├── pump-deployer.ts         # Solana token deployment
│   ├── revenue-distributor.ts   # Revenue distribution
│   ├── solana-wallet.ts         # Solana wallet utilities
│   ├── telegram-notifier.ts     # Telegram DM notifications
│   ├── twitter-poster.ts        # Twitter/X auto-posting
│   ├── auth.ts                  # API authentication
│   ├── url-validator.ts         # URL validation + SSRF protection
│   ├── image-store.ts           # Token image storage
│   └── siteConfig.ts            # Site navigation config
├── hooks/
│   └── useTokenPrices.ts        # Live token price polling hook
├── public/
│   └── tokens/                  # Generated token images
└── data/                        # SQLite database (runtime)
```

## Database

SQLite with WAL mode. Tables:

| Table | Purpose |
|-------|---------|
| `headlines` | News headlines (FIFO queue, left/right/center columns) |
| `main_headline` | Single main headline (id=1) |
| `coin_of_the_day` | Single featured coin (id=1) |
| `submissions` | User submission queue with status workflow |
| `tokens` | Token records (name, ticker, mint address, pump URL) |
| `revenue_events` | Revenue distribution tracking |
| `votes` | WAGMI/NGMI votes per headline |
| `activity_log` | Platform activity events (War Room feed) |
| `whitelist` | Telegram user whitelist |

## Submission Workflow

1. User sends URL via `/submit` in Telegram
2. Provides Solana wallet address
3. Scheduler picks up pending submissions (up to 10 per cycle)
4. AI validates: fact-checking, freshness (< 6h), duplicate detection
5. Approved submissions enter publishing queue
6. Publishing (up to 3 per cycle, fair round-robin):
   - Headline created from article content
   - AI scores importance (0-100) for breaking siren
   - AI generates McAfee-style commentary
   - Token metadata generated (name, ticker, image)
   - Token deployed on pump.fun
   - Activity logged to War Room feed
7. Submitter notified via Telegram DM
8. Auto-posted to Twitter/X (if configured)

## Deployment

### Production (PM2)

```bash
npm run build
pm2 start ecosystem.config.js
```

The `ecosystem.config.js` runs three processes: Next.js server, Telegram bot, and scheduler worker.

### Website only (Vercel)

Works with Vercel but requires a cloud database (Turso, Neon, etc.) instead of SQLite. Bot and scheduler must run separately.

### Bot + Scheduler

Run on any server that stays online: Railway, Render, DigitalOcean, or a VPS.

## Tech Stack

- **Framework**: Next.js 15 (App Router), React 19, TypeScript 5.7
- **Styling**: Tailwind CSS 3.4, custom CSS
- **Database**: SQLite (better-sqlite3) with WAL mode
- **Bot**: Grammy (Telegram Bot Framework)
- **AI**: OpenAI (GPT-4o-mini, text-embedding-3-small, gpt-image-1)
- **Blockchain**: Solana Web3.js, @solana/spl-token, pump.fun API
- **Fonts**: JetBrains Mono, Space Grotesk, Syne (self-hosted via next/font)

## License

MIT
