# AINTIVIRUS - Drudge Report for Crypto

A Drudge Report-style news aggregation website for the crypto community, managed via Telegram bot.

## Features

- **Drudge Report Layout**: Three-column design with main headline spotlight
- **Crypto Theme**: Dark mode with neon cyan/purple accents
- **Telegram Bot**: Push headlines directly from Telegram
- **Whitelist Auth**: Only authorized users can post
- **FIFO Queue**: New headlines push to the top, old ones fall off

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Get from [@BotFather](https://t.me/BotFather) |
| `ADMIN_TELEGRAM_IDS` | Comma-separated Telegram user IDs for admins |
| `API_SECRET_KEY` | Random secret for API authentication |
| `NEXT_PUBLIC_SITE_URL` | Your website URL |

### 3. Run the Website

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

### 4. Run the Telegram Bot

In a separate terminal:

```bash
npm run bot
```

## Telegram Bot Commands

### User Commands
- `/start` - Welcome message and status
- `/help` - Show all available commands
- `/add` - Add a new headline (interactive)
- `/main` - Set the main/center headline
- `/list` - View recent headlines with IDs
- `/remove <id>` - Remove a headline by ID
- `/cancel` - Cancel current operation

### Admin Commands
- `/whitelist` - View all whitelisted users
- `/adduser <id> [username]` - Add user to whitelist
- `/removeuser <id>` - Remove user from whitelist

## Project Structure

```
aintivirus-drudgereport/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   ├── headlines/     # Headlines CRUD
│   │   └── main-headline/ # Main headline API
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Homepage
│   └── globals.css        # Styles
├── components/            # React components
│   ├── MainHeadline.tsx
│   ├── HeadlineColumn.tsx
│   └── HeadlineLink.tsx
├── lib/                   # Utilities
│   ├── db.ts              # Database functions
│   └── types.ts           # TypeScript types
├── bot/                   # Telegram bot
│   └── index.ts
└── data/                  # SQLite database
```

## Deployment

### Website (Vercel)

1. Push to GitHub
2. Import to Vercel
3. Add environment variables
4. Deploy

Note: For Vercel, you'll need to use a cloud database like Turso or Vercel Postgres instead of SQLite.

### Telegram Bot

The bot needs to run separately. Options:
- Railway
- Render
- DigitalOcean
- Any VPS

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: SQLite (better-sqlite3)
- **Bot**: Grammy (Telegram Bot Framework)

## License

MIT
