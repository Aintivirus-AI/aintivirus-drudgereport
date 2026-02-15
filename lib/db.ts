import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { VALID_STATUS_TRANSITIONS } from "./types";
import type { 
  Headline, 
  MainHeadlineData, 
  CoinOfTheDayData,
  WhitelistUser,
  Submission,
  SubmissionStatus,
  ContentType,
  Token,
  RevenueEvent,
  RevenueStatus,
  Vote,
  VoteCounts,
  ActivityEvent,
  ActivityEventType,
  ClaimBatch,
  ClaimBatchStatus,
  ClaimAllocation,
  ClaimAllocationStatus,
  TokenVolumeSnapshot,
} from "./types";

// Database path
const dbDir = path.join(process.cwd(), "data");
const dbPath = path.join(dbDir, "headlines.db");

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Create/open database
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");
// Set busy timeout to handle concurrent writes from multiple processes (web, bot, scheduler)
db.pragma("busy_timeout = 5000");

// Initialize tables
db.exec(`
  -- Headlines table (FIFO queue)
  CREATE TABLE IF NOT EXISTS headlines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    column TEXT DEFAULT 'left' CHECK(column IN ('left', 'right', 'center')),
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Main headline (single row, updated in place)
  CREATE TABLE IF NOT EXISTS main_headline (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    subtitle TEXT,
    image_url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Coin of the day (single row, updated in place)
  CREATE TABLE IF NOT EXISTS coin_of_the_day (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Whitelist table for Telegram users
  CREATE TABLE IF NOT EXISTS whitelist (
    telegram_id TEXT PRIMARY KEY,
    username TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- User submissions queue
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id TEXT NOT NULL,
    telegram_username TEXT,
    sol_address TEXT NOT NULL,
    url TEXT NOT NULL,
    content_type TEXT DEFAULT 'other' CHECK(content_type IN ('article', 'tweet', 'youtube', 'tiktok', 'other')),
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'validating', 'approved', 'rejected', 'published')),
    rejection_reason TEXT,
    content_hash TEXT,
    embedding TEXT,
    cached_content TEXT,
    published_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Token tracking
  CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    headline_id INTEGER REFERENCES headlines(id),
    submission_id INTEGER REFERENCES submissions(id),
    token_name TEXT NOT NULL,
    ticker TEXT NOT NULL,
    image_url TEXT,
    mint_address TEXT,
    pump_url TEXT,
    deployer_sol_address TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Revenue tracking
  CREATE TABLE IF NOT EXISTS revenue_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_id INTEGER NOT NULL REFERENCES tokens(id),
    amount_lamports INTEGER NOT NULL,
    submitter_share_lamports INTEGER NOT NULL,
    burn_share_lamports INTEGER NOT NULL,
    submitter_tx_signature TEXT,
    burn_tx_signature TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'submitter_paid', 'burned', 'completed', 'failed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Votes table (WAGMI/NGMI community voting)
  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    headline_id INTEGER NOT NULL REFERENCES headlines(id),
    vote_type TEXT NOT NULL CHECK(vote_type IN ('wagmi', 'ngmi')),
    voter_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(headline_id, voter_hash)
  );

  -- Activity log (War Room feed)
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes for better query performance
  CREATE INDEX IF NOT EXISTS idx_headlines_column ON headlines(column);
  CREATE INDEX IF NOT EXISTS idx_headlines_created_at ON headlines(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_submissions_status ON submissions(status);
  CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_submissions_url ON submissions(url);
  CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(telegram_user_id);
  CREATE INDEX IF NOT EXISTS idx_tokens_headline_id ON tokens(headline_id);
  CREATE INDEX IF NOT EXISTS idx_tokens_submission_id ON tokens(submission_id);
  CREATE INDEX IF NOT EXISTS idx_revenue_events_token_id ON revenue_events(token_id);
  CREATE INDEX IF NOT EXISTS idx_revenue_events_status ON revenue_events(status);
  CREATE INDEX IF NOT EXISTS idx_votes_headline_id ON votes(headline_id);
  CREATE INDEX IF NOT EXISTS idx_votes_voter_hash ON votes(voter_hash);
  CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_activity_log_event_type ON activity_log(event_type);

  -- Claim batches: tracks each bulk pump.fun claim event
  CREATE TABLE IF NOT EXISTS claim_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_signature TEXT UNIQUE NOT NULL,
    total_lamports INTEGER NOT NULL,
    tokens_count INTEGER NOT NULL,
    distributed_lamports INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','distributing','completed','failed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Per-token allocation within a claim batch
  CREATE TABLE IF NOT EXISTS claim_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES claim_batches(id),
    token_id INTEGER NOT NULL REFERENCES tokens(id),
    volume_snapshot REAL NOT NULL,
    share_percent REAL NOT NULL,
    amount_lamports INTEGER NOT NULL,
    submitter_lamports INTEGER NOT NULL,
    submitter_tx_signature TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','skipped')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Volume snapshots for delta calculation between claims
  CREATE TABLE IF NOT EXISTS token_volume_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_id INTEGER NOT NULL REFERENCES tokens(id),
    cumulative_volume REAL NOT NULL,
    snapshot_source TEXT DEFAULT 'pump_api',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_claim_batches_status ON claim_batches(status);
  CREATE INDEX IF NOT EXISTS idx_claim_batches_tx ON claim_batches(tx_signature);
  CREATE INDEX IF NOT EXISTS idx_claim_allocations_batch ON claim_allocations(batch_id);
  CREATE INDEX IF NOT EXISTS idx_claim_allocations_token ON claim_allocations(token_id);
  CREATE INDEX IF NOT EXISTS idx_volume_snapshots_token ON token_volume_snapshots(token_id);
  CREATE INDEX IF NOT EXISTS idx_volume_snapshots_created ON token_volume_snapshots(created_at DESC);

  -- Comments on articles
  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    headline_id INTEGER NOT NULL REFERENCES headlines(id),
    telegram_user_id TEXT NOT NULL,
    telegram_username TEXT,
    telegram_first_name TEXT,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_comments_headline ON comments(headline_id, created_at DESC);

  -- App-wide settings (key-value store for admin toggles)
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Migration: Add image_url column if it doesn't exist
try {
  db.exec(`ALTER TABLE headlines ADD COLUMN image_url TEXT`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE main_headline ADD COLUMN image_url TEXT`);
} catch {
  // Column already exists
}
// Migration: Add token_id to headlines
try {
  db.exec(`ALTER TABLE headlines ADD COLUMN token_id INTEGER REFERENCES tokens(id)`);
} catch {
  // Column already exists
}
// Migration: Add cached_content to submissions
try {
  db.exec(`ALTER TABLE submissions ADD COLUMN cached_content TEXT`);
} catch {
  // Column already exists
}
// Migration: Add importance_score to headlines (for Breaking Siren)
try {
  db.exec(`ALTER TABLE headlines ADD COLUMN importance_score INTEGER DEFAULT 0`);
} catch {
  // Column already exists
}
// Migration: Add mcafee_take to headlines (for AI McAfee Commentary)
try {
  db.exec(`ALTER TABLE headlines ADD COLUMN mcafee_take TEXT`);
} catch {
  // Column already exists
}
// Migration: Add summary to headlines (for COTD full project summaries)
try {
  db.exec(`ALTER TABLE headlines ADD COLUMN summary TEXT`);
} catch {
  // Column already exists
}
// Migration: Add ephemeral deployer wallet columns to tokens
try {
  db.exec(`ALTER TABLE tokens ADD COLUMN creator_wallet_address TEXT`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE tokens ADD COLUMN creator_wallet_encrypted_key TEXT`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE tokens ADD COLUMN last_fee_claim_at DATETIME`);
} catch {
  // Column already exists
}
try {
  db.exec(`ALTER TABLE tokens ADD COLUMN theme TEXT`);
} catch {
  // Column already exists
}

// Insert default main headline if none exists
const mainHeadlineExists = db
  .prepare("SELECT COUNT(*) as count FROM main_headline")
  .get() as { count: number };

if (mainHeadlineExists.count === 0) {
  db.prepare(
    `INSERT INTO main_headline (id, title, url, subtitle) VALUES (1, ?, ?, ?)`
  ).run(
    "WELCOME TO AINTIVIRUS",
    "#",
    "The Drudge Report of Crypto"
  );
}

// ============= HEADLINES CRUD =============

/**
 * Get headlines for a specific column, ordered by newest first (FIFO display)
 * Includes token data if available
 */
export function getHeadlines(
  column: "left" | "right" | "center",
  limit: number = 25
): Headline[] {
  const stmt = db.prepare(`
    SELECT 
      h.id, h.title, h.url, h.column, h.image_url, h.token_id, h.created_at,
      h.importance_score, h.mcafee_take,
      t.ticker, t.pump_url, t.image_url as token_image_url,
      COALESCE(SUM(CASE WHEN v.vote_type = 'wagmi' THEN 1 ELSE 0 END), 0) as wagmi_count
    FROM headlines h
    LEFT JOIN tokens t ON h.token_id = t.id
    LEFT JOIN votes v ON v.headline_id = h.id
    WHERE h.column = ?
    GROUP BY h.id
    ORDER BY h.created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(column, limit) as Array<Headline & { ticker?: string; pump_url?: string; token_image_url?: string; wagmi_count: number }>;
  
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    url: row.url,
    column: row.column,
    image_url: row.image_url,
    token_id: row.token_id,
    created_at: row.created_at,
    importance_score: row.importance_score || 0,
    mcafee_take: row.mcafee_take || null,
    wagmi_count: row.wagmi_count || 0,
    token: row.ticker ? {
      ticker: row.ticker,
      pump_url: row.pump_url || "",
      image_url: row.token_image_url || undefined,
    } : undefined
  }));
}

/**
 * Get all sidebar headlines (left + right) in a single sorted list.
 * Used to distribute headlines evenly across both columns at display time.
 */
export function getSidebarHeadlines(limit: number = 72): Headline[] {
  const stmt = db.prepare(`
    SELECT 
      h.id, h.title, h.url, h.column, h.image_url, h.token_id, h.created_at,
      h.importance_score, h.mcafee_take,
      t.ticker, t.pump_url, t.image_url as token_image_url,
      COALESCE(SUM(CASE WHEN v.vote_type = 'wagmi' THEN 1 ELSE 0 END), 0) as wagmi_count
    FROM headlines h
    LEFT JOIN tokens t ON h.token_id = t.id
    LEFT JOIN votes v ON v.headline_id = h.id
    WHERE h.column IN ('left', 'right')
    GROUP BY h.id
    ORDER BY h.created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as Array<Headline & { ticker?: string; pump_url?: string; token_image_url?: string; wagmi_count: number }>;
  
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    url: row.url,
    column: row.column,
    image_url: row.image_url,
    token_id: row.token_id,
    created_at: row.created_at,
    importance_score: row.importance_score || 0,
    mcafee_take: row.mcafee_take || null,
    wagmi_count: row.wagmi_count || 0,
    token: row.ticker ? {
      ticker: row.ticker,
      pump_url: row.pump_url || "",
      image_url: row.token_image_url || undefined,
    } : undefined
  }));
}

/**
 * Get all headlines across all columns
 * Includes token data if available
 */
export function getAllHeadlines(limit: number = 100): Headline[] {
  const stmt = db.prepare(`
    SELECT 
      h.id, h.title, h.url, h.column, h.image_url, h.token_id, h.created_at,
      h.importance_score, h.mcafee_take,
      t.ticker, t.pump_url, t.image_url as token_image_url
    FROM headlines h
    LEFT JOIN tokens t ON h.token_id = t.id
    ORDER BY h.created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(limit) as Array<Headline & { ticker?: string; pump_url?: string; token_image_url?: string }>;
  
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    url: row.url,
    column: row.column,
    image_url: row.image_url,
    token_id: row.token_id,
    created_at: row.created_at,
    importance_score: row.importance_score || 0,
    mcafee_take: row.mcafee_take || null,
    wagmi_count: 0,
    token: row.ticker ? {
      ticker: row.ticker,
      pump_url: row.pump_url || "",
      image_url: row.token_image_url || undefined,
    } : undefined
  }));
}

/**
 * Get recent headline titles (for duplicate detection against published stories).
 */
export function getRecentHeadlineTitles(hours: number = 24): { id: number; title: string }[] {
  const stmt = db.prepare(`
    SELECT id, title FROM headlines
    WHERE created_at > datetime('now', '-' || ? || ' hours')
    ORDER BY created_at DESC
  `);
  return stmt.all(hours) as { id: number; title: string }[];
}

/**
 * Add a new headline
 */
export function addHeadline(
  title: string,
  url: string,
  column: "left" | "right" = "left",
  imageUrl?: string,
  tokenId?: number
): Headline {
  const stmt = db.prepare(`
    INSERT INTO headlines (title, url, column, image_url, token_id)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id, title, url, column, image_url, token_id, created_at
  `);
  return stmt.get(title, url, column, imageUrl || null, tokenId || null) as Headline;
}

/**
 * Remove a headline by ID.
 * Cleans up related votes, tokens, and revenue events to avoid FK constraint errors.
 *
 * Order matters: headlines.token_id references tokens(id), so we must NULL out
 * the headline's token_id BEFORE deleting the tokens it points to. Otherwise
 * SQLite raises SQLITE_CONSTRAINT_FOREIGNKEY.
 */
export function removeHeadline(id: number): boolean {
  const txn = db.transaction(() => {
    // Delete votes referencing this headline
    db.prepare("DELETE FROM votes WHERE headline_id = ?").run(id);

    // Find tokens linked to this headline and clean up their revenue events
    const tokens = db.prepare("SELECT id FROM tokens WHERE headline_id = ?").all(id) as { id: number }[];
    for (const token of tokens) {
      db.prepare("DELETE FROM revenue_events WHERE token_id = ?").run(token.id);
    }

    // Clear the headline's FK reference to its token BEFORE deleting the token.
    // Without this, DELETE FROM tokens fails because headlines.token_id still
    // points to the token row we're trying to remove.
    db.prepare("UPDATE headlines SET token_id = NULL WHERE id = ?").run(id);

    // Delete tokens linked to this headline
    db.prepare("DELETE FROM tokens WHERE headline_id = ?").run(id);

    // Delete the headline itself
    const result = db.prepare("DELETE FROM headlines WHERE id = ?").run(id);
    return result.changes > 0;
  });

  return txn();
}

/**
 * Get a headline by ID
 */
export function getHeadlineById(id: number): Headline | undefined {
  const stmt = db.prepare(`
    SELECT 
      h.id, h.title, h.url, h.column, h.image_url, h.token_id, h.created_at,
      h.importance_score, h.mcafee_take,
      t.ticker, t.pump_url, t.image_url as token_image_url
    FROM headlines h
    LEFT JOIN tokens t ON h.token_id = t.id
    WHERE h.id = ?
  `);
  const row = stmt.get(id) as (Headline & { ticker?: string; pump_url?: string; token_image_url?: string }) | undefined;
  
  if (!row) return undefined;
  
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    column: row.column,
    image_url: row.image_url,
    token_id: row.token_id,
    created_at: row.created_at,
    importance_score: row.importance_score || 0,
    mcafee_take: row.mcafee_take || null,
    wagmi_count: 0,
    token: row.ticker ? {
      ticker: row.ticker,
      pump_url: row.pump_url || "",
      image_url: row.token_image_url || undefined,
    } : undefined
  };
}

/**
 * Get a headline with full token and submission data (for article pages)
 */
export function getHeadlineWithDetails(id: number): (Headline & {
  token_name?: string;
  mint_address?: string;
  token_image_url?: string;
  submitter_username?: string;
  submitter_wallet?: string;
  submission_created_at?: string;
  cached_content?: string;
  summary?: string;
}) | undefined {
  const stmt = db.prepare(`
    SELECT 
      h.id, h.title, h.url, h.column, h.image_url, h.token_id, h.created_at,
      h.importance_score, h.mcafee_take, h.summary,
      t.ticker, t.pump_url, t.token_name, t.mint_address, t.image_url as token_image_url,
      s.telegram_username as submitter_username, s.sol_address as submitter_wallet,
      s.created_at as submission_created_at, s.cached_content
    FROM headlines h
    LEFT JOIN tokens t ON h.token_id = t.id
    LEFT JOIN submissions s ON t.submission_id = s.id
    WHERE h.id = ?
  `);
  const row = stmt.get(id) as any;
  if (!row) return undefined;
  
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    column: row.column,
    image_url: row.image_url,
    token_id: row.token_id,
    created_at: row.created_at,
    importance_score: row.importance_score || 0,
    mcafee_take: row.mcafee_take || null,
    wagmi_count: 0,
    token: row.ticker ? {
      ticker: row.ticker,
      pump_url: row.pump_url || "",
      image_url: row.token_image_url || undefined,
    } : undefined,
    token_name: row.token_name || undefined,
    mint_address: row.mint_address || undefined,
    token_image_url: row.token_image_url || undefined,
    submitter_username: row.submitter_username || undefined,
    submitter_wallet: row.submitter_wallet || undefined,
    submission_created_at: row.submission_created_at || undefined,
    cached_content: row.cached_content || undefined,
    summary: row.summary || undefined,
  };
}

// ============= MAIN HEADLINE =============

/**
 * Get the main headline
 */
export function getMainHeadline(): MainHeadlineData {
  const stmt = db.prepare(`
    SELECT id, title, url, subtitle, image_url, updated_at
    FROM main_headline
    WHERE id = 1
  `);
  return stmt.get() as MainHeadlineData;
}

/**
 * Update the main headline
 */
export function setMainHeadline(
  title: string,
  url: string,
  subtitle?: string,
  imageUrl?: string
): MainHeadlineData {
  const stmt = db.prepare(`
    UPDATE main_headline
    SET title = ?, url = ?, subtitle = ?, image_url = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
    RETURNING id, title, url, subtitle, image_url, updated_at
  `);
  return stmt.get(title, url, subtitle || null, imageUrl || null) as MainHeadlineData;
}

// ============= COIN OF THE DAY =============

/**
 * Get the coin of the day
 */
export function getCoinOfTheDay(): CoinOfTheDayData | null {
  const stmt = db.prepare(`
    SELECT id, title, url, description, image_url, updated_at
    FROM coin_of_the_day
    WHERE id = 1
  `);
  return (stmt.get() as CoinOfTheDayData) || null;
}

/**
 * Set / update the coin of the day
 */
export function setCoinOfTheDay(
  title: string,
  url: string,
  description?: string,
  imageUrl?: string
): CoinOfTheDayData {
  // Upsert: insert or replace the single row
  const stmt = db.prepare(`
    INSERT INTO coin_of_the_day (id, title, url, description, image_url, updated_at)
    VALUES (1, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      url = excluded.url,
      description = excluded.description,
      image_url = excluded.image_url,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, title, url, description, image_url, updated_at
  `);
  return stmt.get(title, url, description || null, imageUrl || null) as CoinOfTheDayData;
}

// ============= WHITELIST =============

/**
 * Check if a Telegram user is whitelisted
 */
export function isWhitelisted(telegramId: string): boolean {
  const stmt = db.prepare(
    "SELECT COUNT(*) as count FROM whitelist WHERE telegram_id = ?"
  );
  const result = stmt.get(telegramId) as { count: number };
  return result.count > 0;
}

/**
 * Add a user to the whitelist
 */
export function addToWhitelist(
  telegramId: string,
  username?: string
): WhitelistUser {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO whitelist (telegram_id, username)
    VALUES (?, ?)
    RETURNING telegram_id, username, added_at
  `);
  return stmt.get(telegramId, username || null) as WhitelistUser;
}

/**
 * Remove a user from the whitelist
 */
export function removeFromWhitelist(telegramId: string): boolean {
  const stmt = db.prepare("DELETE FROM whitelist WHERE telegram_id = ?");
  const result = stmt.run(telegramId);
  return result.changes > 0;
}

/**
 * Get all whitelisted users
 */
export function getWhitelist(): WhitelistUser[] {
  const stmt = db.prepare(`
    SELECT telegram_id, username, added_at
    FROM whitelist
    ORDER BY added_at DESC
  `);
  return stmt.all() as WhitelistUser[];
}

// ============= SUBMISSIONS CRUD =============

/**
 * Create a new submission
 */
export function createSubmission(
  telegramUserId: string,
  solAddress: string,
  url: string,
  contentType: ContentType = "other",
  telegramUsername?: string
): Submission {
  const stmt = db.prepare(`
    INSERT INTO submissions (telegram_user_id, telegram_username, sol_address, url, content_type)
    VALUES (?, ?, ?, ?, ?)
    RETURNING *
  `);
  return stmt.get(telegramUserId, telegramUsername || null, solAddress, url, contentType) as Submission;
}

/**
 * Get a submission by ID
 */
export function getSubmissionById(id: number): Submission | undefined {
  const stmt = db.prepare(`SELECT * FROM submissions WHERE id = ?`);
  return stmt.get(id) as Submission | undefined;
}

/**
 * Get submissions by status
 */
export function getSubmissionsByStatus(status: SubmissionStatus, limit: number = 50): Submission[] {
  const stmt = db.prepare(`
    SELECT * FROM submissions 
    WHERE status = ? 
    ORDER BY created_at ASC 
    LIMIT ?
  `);
  return stmt.all(status, limit) as Submission[];
}

/**
 * Get pending submissions count
 */
export function getPendingSubmissionsCount(): number {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM submissions WHERE status = 'pending'`);
  const result = stmt.get() as { count: number };
  return result.count;
}

/**
 * Purge stale submissions older than the given hours.
 * Removes pending, validating, and approved submissions that have been
 * sitting in the queue too long. Published and rejected are left alone.
 * Returns the number of rows deleted.
 */
export function purgeStaleSubmissions(olderThanHours: number = 72): number {
  const stmt = db.prepare(`
    DELETE FROM submissions
    WHERE status IN ('pending', 'validating', 'approved')
      AND created_at < datetime('now', '-' || ? || ' hours')
  `);
  const result = stmt.run(olderThanHours);
  return result.changes;
}

/**
 * Get submission count by status (efficient COUNT query).
 */
export function getSubmissionCountByStatus(status: SubmissionStatus): number {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM submissions WHERE status = ?`);
  const result = stmt.get(status) as { count: number };
  return result.count;
}

/**
 * Update submission status.
 * Uses optimistic locking (WHERE status = currentStatus) to prevent TOCTOU race conditions.
 * Returns false if the row was concurrently modified (status already changed).
 */
export function updateSubmissionStatus(
  id: number,
  newStatus: SubmissionStatus,
  rejectionReason?: string
): boolean {
  // Determine valid source states for this transition
  const validSourceStates = Object.entries(VALID_STATUS_TRANSITIONS)
    .filter(([, targets]) => targets.includes(newStatus))
    .map(([source]) => source);

  if (validSourceStates.length === 0) {
    throw new Error(`No valid source states can transition to '${newStatus}'`);
  }

  // Atomic optimistic locking: UPDATE only if the current status allows this transition.
  // This prevents two concurrent processes from both reading "pending" and both writing "validating".
  const placeholders = validSourceStates.map(() => "?").join(", ");
  const stmt = db.prepare(`
    UPDATE submissions 
    SET status = ?, rejection_reason = COALESCE(?, rejection_reason)
    WHERE id = ? AND status IN (${placeholders})
  `);
  const result = stmt.run(newStatus, rejectionReason || null, id, ...validSourceStates);
  return result.changes > 0;
}

/**
 * Update submission content hash and embedding
 */
export function updateSubmissionContentHash(
  id: number,
  contentHash: string,
  embedding?: number[]
): boolean {
  const stmt = db.prepare(`
    UPDATE submissions 
    SET content_hash = ?, embedding = ?
    WHERE id = ?
  `);
  const embeddingJson = embedding ? JSON.stringify(embedding) : null;
  const result = stmt.run(contentHash, embeddingJson, id);
  return result.changes > 0;
}

/**
 * Update submission cached content (JSON-serialised PageContent).
 */
export function updateSubmissionCachedContent(
  id: number,
  cachedContent: string
): boolean {
  const stmt = db.prepare(`UPDATE submissions SET cached_content = ? WHERE id = ?`);
  const result = stmt.run(cachedContent, id);
  return result.changes > 0;
}

/**
 * Mark submission as published.
 * Uses optimistic locking — only succeeds if the submission is currently 'approved'.
 */
export function markSubmissionPublished(id: number): boolean {
  const stmt = db.prepare(`
    UPDATE submissions 
    SET status = 'published', published_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'approved'
  `);
  const result = stmt.run(id);

  if (result.changes === 0) {
    const current = getSubmissionById(id);
    if (current && current.status !== "approved") {
      throw new Error(
        `Cannot publish: submission #${id} is '${current.status}', must be 'approved'`
      );
    }
  }

  return result.changes > 0;
}

/**
 * Get recent submissions for duplicate detection
 */
export function getRecentSubmissionsForDuplicateCheck(days: number = 7): Submission[] {
  const stmt = db.prepare(`
    SELECT * FROM submissions 
    WHERE created_at > datetime('now', '-' || ? || ' days')
    AND status NOT IN ('rejected')
    ORDER BY created_at DESC
  `);
  return stmt.all(days) as Submission[];
}

/**
 * Get submissions by telegram user
 */
export function getSubmissionsByUser(telegramUserId: string, limit: number = 20): Submission[] {
  const stmt = db.prepare(`
    SELECT * FROM submissions 
    WHERE telegram_user_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  return stmt.all(telegramUserId, limit) as Submission[];
}

/**
 * Count published articles today
 */
export function getPublishedTodayCount(): number {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM submissions 
    WHERE status = 'published' 
    AND date(published_at) = date('now')
  `);
  const result = stmt.get() as { count: number };
  return result.count;
}

/**
 * Get recent submission count by user (for rate limiting).
 */
export function getRecentSubmissionCountByUser(
  telegramUserId: string,
  hours: number = 1
): number {
  const stmt = db.prepare(`
    SELECT COUNT(*) as count FROM submissions 
    WHERE telegram_user_id = ? 
    AND created_at > datetime('now', '-' || ? || ' hours')
  `);
  const result = stmt.get(telegramUserId, hours) as { count: number };
  return result.count;
}

/**
 * Check if a URL was recently submitted (for duplicate URL detection at submission time).
 */
export function getRecentSubmissionByUrl(
  url: string,
  hours: number = 48
): Submission | undefined {
  const stmt = db.prepare(`
    SELECT * FROM submissions 
    WHERE url = ? 
    AND created_at > datetime('now', '-' || ? || ' hours')
    AND status NOT IN ('rejected')
    LIMIT 1
  `);
  return stmt.get(url, hours) as Submission | undefined;
}

/**
 * Get top submitters by published article count (for leaderboard).
 */
export function getTopSubmitters(limit: number = 20): Array<{
  telegram_username: string | null;
  telegram_user_id: string;
  sol_address: string;
  published_count: number;
  total_submissions: number;
}> {
  const stmt = db.prepare(`
    SELECT 
      telegram_username,
      telegram_user_id,
      sol_address,
      SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) as published_count,
      COUNT(*) as total_submissions
    FROM submissions
    GROUP BY telegram_user_id
    HAVING published_count > 0
    ORDER BY published_count DESC
    LIMIT ?
  `);
  return stmt.all(limit) as Array<{
    telegram_username: string | null;
    telegram_user_id: string;
    sol_address: string;
    published_count: number;
    total_submissions: number;
  }>;
}

/**
 * Get recent token launches with headline data (for leaderboard).
 */
export function getRecentTokenLaunches(limit: number = 20): Array<{
  token_id: number;
  token_name: string;
  ticker: string;
  mint_address: string | null;
  pump_url: string | null;
  token_image_url: string | null;
  headline_title: string;
  headline_id: number;
  created_at: string;
}> {
  const stmt = db.prepare(`
    SELECT 
      t.id as token_id,
      t.token_name,
      t.ticker,
      t.mint_address,
      t.pump_url,
      t.image_url as token_image_url,
      h.title as headline_title,
      h.id as headline_id,
      t.created_at
    FROM tokens t
    LEFT JOIN headlines h ON t.headline_id = h.id
    WHERE t.mint_address IS NOT NULL
    ORDER BY t.created_at DESC
    LIMIT ?
  `);
  return stmt.all(limit) as Array<{
    token_id: number;
    token_name: string;
    ticker: string;
    mint_address: string | null;
    pump_url: string | null;
    token_image_url: string | null;
    headline_title: string;
    headline_id: number;
    created_at: string;
  }>;
}

// ============= TOKENS CRUD =============

/**
 * Create a new token
 */
export function createToken(
  tokenName: string,
  ticker: string,
  deployerSolAddress: string,
  headlineId?: number,
  submissionId?: number,
  imageUrl?: string,
  mintAddress?: string,
  pumpUrl?: string,
  theme?: string
): Token {
  const stmt = db.prepare(`
    INSERT INTO tokens (headline_id, submission_id, token_name, ticker, image_url, mint_address, pump_url, deployer_sol_address, theme)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `);
  return stmt.get(
    headlineId || null,
    submissionId || null,
    tokenName,
    ticker,
    imageUrl || null,
    mintAddress || null,
    pumpUrl || null,
    deployerSolAddress,
    theme || null
  ) as Token;
}

/**
 * Get token by ID
 */
export function getTokenById(id: number): Token | undefined {
  const stmt = db.prepare(`SELECT * FROM tokens WHERE id = ?`);
  return stmt.get(id) as Token | undefined;
}

/**
 * Get token by headline ID
 */
export function getTokenByHeadlineId(headlineId: number): Token | undefined {
  const stmt = db.prepare(`SELECT * FROM tokens WHERE headline_id = ?`);
  return stmt.get(headlineId) as Token | undefined;
}

/**
 * Get token by mint address
 */
export function getTokenByMintAddress(mintAddress: string): Token | undefined {
  const stmt = db.prepare(`SELECT * FROM tokens WHERE mint_address = ?`);
  return stmt.get(mintAddress) as Token | undefined;
}

/**
 * Update token with deployment info
 */
export function updateTokenDeployment(
  id: number,
  mintAddress: string,
  pumpUrl: string
): boolean {
  const stmt = db.prepare(`
    UPDATE tokens 
    SET mint_address = ?, pump_url = ?
    WHERE id = ?
  `);
  const result = stmt.run(mintAddress, pumpUrl, id);
  return result.changes > 0;
}

/**
 * Link token to headline.
 * Uses a transaction to ensure both updates succeed or neither does.
 */
export function linkTokenToHeadline(tokenId: number, headlineId: number): boolean {
  const txn = db.transaction(() => {
    // Update token's headline_id
    const stmt1 = db.prepare(`UPDATE tokens SET headline_id = ? WHERE id = ?`);
    stmt1.run(headlineId, tokenId);
    
    // Update headline's token_id
    const stmt2 = db.prepare(`UPDATE headlines SET token_id = ? WHERE id = ?`);
    const result = stmt2.run(tokenId, headlineId);
    return result.changes > 0;
  });

  return txn();
}

/**
 * Get all tokens
 */
export function getAllTokens(limit: number = 100): Token[] {
  const stmt = db.prepare(`
    SELECT * FROM tokens 
    ORDER BY created_at DESC 
    LIMIT ?
  `);
  return stmt.all(limit) as Token[];
}

/**
 * Check if ticker already exists
 */
export function tickerExists(ticker: string): boolean {
  const stmt = db.prepare(`SELECT COUNT(*) as count FROM tokens WHERE ticker = ?`);
  const result = stmt.get(ticker) as { count: number };
  return result.count > 0;
}

// ============= EPHEMERAL DEPLOYER WALLET CRUD =============

/**
 * Store the encrypted ephemeral deployer key for a token.
 * Called after successful on-chain deployment.
 */
export function saveCreatorWalletKey(
  tokenId: number,
  walletAddress: string,
  encryptedKey: string
): boolean {
  const stmt = db.prepare(`
    UPDATE tokens
    SET creator_wallet_address = ?, creator_wallet_encrypted_key = ?
    WHERE id = ?
  `);
  const result = stmt.run(walletAddress, encryptedKey, tokenId);
  return result.changes > 0;
}

/**
 * Get tokens that have an ephemeral deployer key and are due for a fee claim.
 * Returns tokens not claimed within the last `minAgeMinutes` minutes.
 */
export function getTokensForFeeClaim(minAgeMinutes: number = 30): Token[] {
  const stmt = db.prepare(`
    SELECT * FROM tokens
    WHERE creator_wallet_encrypted_key IS NOT NULL
      AND mint_address IS NOT NULL
      AND (
        last_fee_claim_at IS NULL
        OR last_fee_claim_at <= datetime('now', '-' || ? || ' minutes')
      )
    ORDER BY last_fee_claim_at ASC NULLS FIRST, created_at ASC
  `);
  return stmt.all(minAgeMinutes) as Token[];
}

/**
 * Update the last fee claim timestamp for a token.
 */
export function updateFeeClaimTimestamp(tokenId: number): boolean {
  const stmt = db.prepare(`
    UPDATE tokens SET last_fee_claim_at = datetime('now') WHERE id = ?
  `);
  const result = stmt.run(tokenId);
  return result.changes > 0;
}

/**
 * Reset fee claim timestamps for all tokens so they become eligible immediately.
 * Useful after fixing infrastructure issues that caused false "no fees" cooldowns.
 * Returns the number of tokens reset.
 */
export function resetFeeClaimTimestamps(): number {
  const stmt = db.prepare(`
    UPDATE tokens SET last_fee_claim_at = NULL
    WHERE creator_wallet_encrypted_key IS NOT NULL
      AND mint_address IS NOT NULL
  `);
  const result = stmt.run();
  return result.changes;
}

/**
 * Check if a Solana address belongs to a known ephemeral deployer wallet.
 * Used by the Helius webhook to skip internal sweep transactions.
 */
export function isKnownCreatorWallet(address: string): boolean {
  const stmt = db.prepare(`
    SELECT 1 FROM tokens WHERE creator_wallet_address = ? LIMIT 1
  `);
  return stmt.get(address) !== undefined;
}

// ============= REVENUE EVENTS CRUD =============

// Revenue split — single source of truth (configurable via env)
// Clamped to [0, 1] to prevent negative or over-100% shares
const _rawSharePercent = parseFloat(process.env.REVENUE_SUBMITTER_SHARE || "0.5");
const SUBMITTER_SHARE_PERCENT = isNaN(_rawSharePercent) ? 0.5 : Math.max(0, Math.min(1, _rawSharePercent));

/**
 * Create a new revenue event
 */
export function createRevenueEvent(
  tokenId: number,
  amountLamports: number
): RevenueEvent {
  const submitterShare = Math.floor(amountLamports * SUBMITTER_SHARE_PERCENT);
  const burnShare = amountLamports - submitterShare;
  
  const stmt = db.prepare(`
    INSERT INTO revenue_events (token_id, amount_lamports, submitter_share_lamports, burn_share_lamports)
    VALUES (?, ?, ?, ?)
    RETURNING *
  `);
  return stmt.get(tokenId, amountLamports, submitterShare, burnShare) as RevenueEvent;
}

/**
 * Get revenue event by ID
 */
export function getRevenueEventById(id: number): RevenueEvent | undefined {
  const stmt = db.prepare(`SELECT * FROM revenue_events WHERE id = ?`);
  return stmt.get(id) as RevenueEvent | undefined;
}

/**
 * Get pending revenue events
 */
export function getPendingRevenueEvents(limit: number = 50): RevenueEvent[] {
  const stmt = db.prepare(`
    SELECT * FROM revenue_events 
    WHERE status = 'pending' 
    ORDER BY created_at ASC 
    LIMIT ?
  `);
  return stmt.all(limit) as RevenueEvent[];
}

/**
 * Update revenue event status
 */
export function updateRevenueEventStatus(
  id: number,
  status: RevenueStatus,
  submitterTxSignature?: string,
  burnTxSignature?: string
): boolean {
  const stmt = db.prepare(`
    UPDATE revenue_events 
    SET status = ?, submitter_tx_signature = COALESCE(?, submitter_tx_signature), burn_tx_signature = COALESCE(?, burn_tx_signature)
    WHERE id = ?
  `);
  const result = stmt.run(status, submitterTxSignature || null, burnTxSignature || null, id);
  return result.changes > 0;
}

/**
 * Get revenue events by token
 */
export function getRevenueEventsByToken(tokenId: number): RevenueEvent[] {
  const stmt = db.prepare(`
    SELECT * FROM revenue_events 
    WHERE token_id = ? 
    ORDER BY created_at DESC
  `);
  return stmt.all(tokenId) as RevenueEvent[];
}

/**
 * Get total revenue stats
 */
export function getRevenueStats(): { total: number; distributed: number; burned: number } {
  const stmt = db.prepare(`
    SELECT 
      COALESCE(SUM(amount_lamports), 0) as total,
      COALESCE(SUM(CASE WHEN status IN ('submitter_paid', 'completed') THEN submitter_share_lamports ELSE 0 END), 0) as distributed,
      COALESCE(SUM(CASE WHEN status IN ('burned', 'completed') THEN burn_share_lamports ELSE 0 END), 0) as burned
    FROM revenue_events
  `);
  return stmt.get() as { total: number; distributed: number; burned: number };
}

// ============= UTILITY =============

/**
 * Clean up old headlines (optional maintenance function).
 * Uses a transaction to safely remove headlines and all their child records
 * (votes, revenue events, tokens) to avoid FK constraint errors.
 */
export function cleanupOldHeadlines(keepCount: number = 100): number {
  const txn = db.transaction(() => {
    // Find IDs that will be deleted
    const toDelete = db.prepare(`
      SELECT id FROM headlines
      WHERE id NOT IN (
        SELECT id FROM (
          SELECT id FROM headlines WHERE "column" = 'left' ORDER BY created_at DESC LIMIT ?
          UNION ALL
          SELECT id FROM headlines WHERE "column" = 'right' ORDER BY created_at DESC LIMIT ?
          UNION ALL
          SELECT id FROM headlines WHERE "column" = 'center' ORDER BY created_at DESC LIMIT ?
        )
      )
    `).all(keepCount, keepCount, keepCount) as { id: number }[];

    if (toDelete.length === 0) return 0;

    for (const { id } of toDelete) {
      // Delete votes
      db.prepare("DELETE FROM votes WHERE headline_id = ?").run(id);

      // Delete revenue events for tokens linked to this headline
      const tokens = db.prepare("SELECT id FROM tokens WHERE headline_id = ?").all(id) as { id: number }[];
      for (const token of tokens) {
        db.prepare("DELETE FROM revenue_events WHERE token_id = ?").run(token.id);
      }

      // Clear the headline's FK reference to its token
      db.prepare("UPDATE headlines SET token_id = NULL WHERE id = ?").run(id);

      // Delete tokens linked to this headline
      db.prepare("DELETE FROM tokens WHERE headline_id = ?").run(id);
    }

    // Now safely delete the headlines
    const ids = toDelete.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(", ");
    const result = db.prepare(`DELETE FROM headlines WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  });

  return txn();
}

/**
 * Detect content type from URL
 */
export function detectContentType(url: string): ContentType {
  const lowerUrl = url.toLowerCase();
  
  if (lowerUrl.includes("twitter.com") || lowerUrl.includes("x.com")) {
    return "tweet";
  }
  if (lowerUrl.includes("youtube.com") || lowerUrl.includes("youtu.be")) {
    return "youtube";
  }
  if (lowerUrl.includes("tiktok.com")) {
    return "tiktok";
  }
  
  return "article";
}

// ============= HEADLINE EXTRAS (Siren + McAfee) =============

/**
 * Update headline importance score (for Breaking Siren).
 */
export function updateHeadlineImportanceScore(id: number, score: number): boolean {
  const stmt = db.prepare(`UPDATE headlines SET importance_score = ? WHERE id = ?`);
  const result = stmt.run(score, id);
  return result.changes > 0;
}

/**
 * Update headline McAfee take (AI commentary).
 */
export function updateHeadlineMcAfeeTake(id: number, take: string): boolean {
  const stmt = db.prepare(`UPDATE headlines SET mcafee_take = ? WHERE id = ?`);
  const result = stmt.run(take, id);
  return result.changes > 0;
}

/**
 * Update headline summary (for COTD project write-ups).
 */
export function updateHeadlineSummary(id: number, summary: string): boolean {
  const stmt = db.prepare(`UPDATE headlines SET summary = ? WHERE id = ?`);
  const result = stmt.run(summary, id);
  return result.changes > 0;
}

/**
 * Get the most important breaking headline from the last N hours.
 * Returns the headline with the highest importance_score >= threshold.
 */
export function getBreakingHeadline(
  hours: number = 2,
  threshold: number = 80
): Headline | undefined {
  const stmt = db.prepare(`
    SELECT 
      h.id, h.title, h.url, h.column, h.image_url, h.token_id, h.created_at,
      h.importance_score, h.mcafee_take,
      t.ticker, t.pump_url, t.image_url as token_image_url
    FROM headlines h
    LEFT JOIN tokens t ON h.token_id = t.id
    WHERE h.importance_score >= ?
    AND h.created_at > datetime('now', '-' || ? || ' hours')
    ORDER BY h.importance_score DESC, h.created_at DESC
    LIMIT 1
  `);
  const row = stmt.get(threshold, hours) as (Headline & { ticker?: string; pump_url?: string; token_image_url?: string }) | undefined;
  if (!row) return undefined;

  return {
    id: row.id,
    title: row.title,
    url: row.url,
    column: row.column,
    image_url: row.image_url,
    token_id: row.token_id,
    created_at: row.created_at,
    importance_score: row.importance_score || 0,
    mcafee_take: row.mcafee_take || null,
    wagmi_count: 0,
    token: row.ticker ? {
      ticker: row.ticker,
      pump_url: row.pump_url || "",
      image_url: row.token_image_url || undefined,
    } : undefined
  };
}

/**
 * Get related headlines for an article (for "You might also like" section).
 * Returns recent headlines excluding the current one, ordered by recency.
 */
export function getRelatedHeadlines(excludeId: number, limit: number = 6): Headline[] {
  const stmt = db.prepare(`
    SELECT 
      h.id, h.title, h.url, h.column, h.image_url, h.token_id, h.created_at,
      h.importance_score, h.mcafee_take,
      t.ticker, t.pump_url, t.image_url as token_image_url
    FROM headlines h
    LEFT JOIN tokens t ON h.token_id = t.id
    WHERE h.id != ?
    ORDER BY h.created_at DESC
    LIMIT ?
  `);
  const rows = stmt.all(excludeId, limit) as Array<Headline & { ticker?: string; pump_url?: string; token_image_url?: string }>;

  return rows.map(row => ({
    id: row.id,
    title: row.title,
    url: row.url,
    column: row.column,
    image_url: row.image_url,
    token_id: row.token_id,
    created_at: row.created_at,
    importance_score: row.importance_score || 0,
    mcafee_take: row.mcafee_take || null,
    wagmi_count: 0,
    token: row.ticker ? {
      ticker: row.ticker,
      pump_url: row.pump_url || "",
      image_url: row.token_image_url || undefined,
    } : undefined
  }));
}

// ============= VOTES CRUD (WAGMI/NGMI) =============

/**
 * Cast a vote (WAGMI or NGMI). Uses UNIQUE constraint for dedup.
 * Returns true if the vote was cast, false if already voted.
 */
export function castVote(
  headlineId: number,
  voteType: "wagmi" | "ngmi",
  voterHash: string
): boolean {
  try {
    const stmt = db.prepare(`
      INSERT INTO votes (headline_id, vote_type, voter_hash)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(headlineId, voteType, voterHash);
    return result.changes > 0;
  } catch {
    // UNIQUE constraint violation = already voted
    return false;
  }
}

/**
 * Get vote counts for a specific headline.
 */
export function getVoteCounts(headlineId: number): VoteCounts {
  const stmt = db.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN vote_type = 'wagmi' THEN 1 ELSE 0 END), 0) as wagmi,
      COALESCE(SUM(CASE WHEN vote_type = 'ngmi' THEN 1 ELSE 0 END), 0) as ngmi
    FROM votes
    WHERE headline_id = ?
  `);
  return stmt.get(headlineId) as VoteCounts;
}

/**
 * Get global sentiment across all headlines.
 */
export function getGlobalSentiment(): VoteCounts & { ratio: number } {
  const stmt = db.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN vote_type = 'wagmi' THEN 1 ELSE 0 END), 0) as wagmi,
      COALESCE(SUM(CASE WHEN vote_type = 'ngmi' THEN 1 ELSE 0 END), 0) as ngmi
    FROM votes
  `);
  const counts = stmt.get() as VoteCounts;
  const total = counts.wagmi + counts.ngmi;
  return {
    ...counts,
    ratio: total > 0 ? counts.wagmi / total : 0.5,
  };
}

/**
 * Check if a voter has already voted on a headline.
 */
export function hasVoted(headlineId: number, voterHash: string): string | null {
  const stmt = db.prepare(`
    SELECT vote_type FROM votes WHERE headline_id = ? AND voter_hash = ?
  `);
  const row = stmt.get(headlineId, voterHash) as { vote_type: string } | undefined;
  return row ? row.vote_type : null;
}

// ============= ACTIVITY LOG (War Room) =============

/**
 * Insert an activity log entry.
 */
export function insertActivityLog(
  eventType: ActivityEventType,
  message: string,
  metadata?: Record<string, unknown>
): ActivityEvent {
  const stmt = db.prepare(`
    INSERT INTO activity_log (event_type, message, metadata)
    VALUES (?, ?, ?)
    RETURNING id, event_type, message, metadata, created_at
  `);
  return stmt.get(
    eventType,
    message,
    metadata ? JSON.stringify(metadata) : null
  ) as ActivityEvent;
}

/**
 * Get recent activity log entries.
 * If `afterId` is provided, returns only events after that ID (for polling).
 */
export function getActivityLog(
  limit: number = 50,
  afterId?: number
): ActivityEvent[] {
  if (afterId) {
    const stmt = db.prepare(`
      SELECT id, event_type, message, metadata, created_at
      FROM activity_log
      WHERE id > ?
      ORDER BY id DESC
      LIMIT ?
    `);
    return stmt.all(afterId, limit) as ActivityEvent[];
  }
  const stmt = db.prepare(`
    SELECT id, event_type, message, metadata, created_at
    FROM activity_log
    ORDER BY id DESC
    LIMIT ?
  `);
  return stmt.all(limit) as ActivityEvent[];
}

/**
 * Get activity stats for the War Room dashboard.
 */
export function getActivityStats(): {
  submissionsToday: number;
  tokensLaunchedToday: number;
  votesToday: number;
  approvalRate: number;
} {
  const submissionsToday = db.prepare(`
    SELECT COUNT(*) as count FROM submissions
    WHERE date(created_at) = date('now')
  `).get() as { count: number };

  const tokensToday = db.prepare(`
    SELECT COUNT(*) as count FROM tokens
    WHERE date(created_at) = date('now')
    AND mint_address IS NOT NULL
  `).get() as { count: number };

  const votesToday = db.prepare(`
    SELECT COUNT(*) as count FROM votes
    WHERE date(created_at) = date('now')
  `).get() as { count: number };

  const approvalStats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('approved', 'published') THEN 1 ELSE 0 END) as approved
    FROM submissions
    WHERE status NOT IN ('pending', 'validating')
  `).get() as { total: number; approved: number };

  return {
    submissionsToday: submissionsToday.count,
    tokensLaunchedToday: tokensToday.count,
    votesToday: votesToday.count,
    approvalRate: approvalStats.total > 0
      ? Math.round((approvalStats.approved / approvalStats.total) * 100)
      : 0,
  };
}

// ============= CLAIM DISTRIBUTION CRUD =============

/**
 * Get all active tokens (those with a mint address) for claim distribution.
 */
export function getActiveTokensForClaim(): Token[] {
  const stmt = db.prepare(`
    SELECT * FROM tokens
    WHERE mint_address IS NOT NULL
    ORDER BY created_at ASC
  `);
  return stmt.all() as Token[];
}

/**
 * Check if a claim batch already exists for a given transaction signature.
 */
export function getClaimBatchByTxSignature(txSignature: string): ClaimBatch | undefined {
  const stmt = db.prepare(`SELECT * FROM claim_batches WHERE tx_signature = ?`);
  return stmt.get(txSignature) as ClaimBatch | undefined;
}

/**
 * Create a new claim batch record.
 */
export function createClaimBatch(
  txSignature: string,
  totalLamports: number,
  tokensCount: number
): ClaimBatch {
  const stmt = db.prepare(`
    INSERT INTO claim_batches (tx_signature, total_lamports, tokens_count)
    VALUES (?, ?, ?)
    RETURNING *
  `);
  return stmt.get(txSignature, totalLamports, tokensCount) as ClaimBatch;
}

/**
 * Update claim batch status and distributed amount.
 */
export function updateClaimBatchStatus(
  id: number,
  status: ClaimBatchStatus,
  distributedLamports?: number
): boolean {
  const stmt = db.prepare(`
    UPDATE claim_batches
    SET status = ?, distributed_lamports = COALESCE(?, distributed_lamports)
    WHERE id = ?
  `);
  const result = stmt.run(status, distributedLamports ?? null, id);
  return result.changes > 0;
}

/**
 * Get claim batch by ID.
 */
export function getClaimBatchById(id: number): ClaimBatch | undefined {
  const stmt = db.prepare(`SELECT * FROM claim_batches WHERE id = ?`);
  return stmt.get(id) as ClaimBatch | undefined;
}

/**
 * Get all claim batches, ordered by newest first.
 */
export function getAllClaimBatches(limit: number = 50): ClaimBatch[] {
  const stmt = db.prepare(`
    SELECT * FROM claim_batches
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(limit) as ClaimBatch[];
}

/**
 * Get pending claim batches (for retry processing).
 */
export function getPendingClaimBatches(): ClaimBatch[] {
  const stmt = db.prepare(`
    SELECT * FROM claim_batches
    WHERE status IN ('pending', 'distributing')
    ORDER BY created_at ASC
  `);
  return stmt.all() as ClaimBatch[];
}

/**
 * Create a claim allocation record for a token within a batch.
 */
export function createClaimAllocation(
  batchId: number,
  tokenId: number,
  volumeSnapshot: number,
  sharePercent: number,
  amountLamports: number,
  submitterLamports: number
): ClaimAllocation {
  const stmt = db.prepare(`
    INSERT INTO claim_allocations (batch_id, token_id, volume_snapshot, share_percent, amount_lamports, submitter_lamports)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING *
  `);
  return stmt.get(batchId, tokenId, volumeSnapshot, sharePercent, amountLamports, submitterLamports) as ClaimAllocation;
}

/**
 * Update a claim allocation's status and tx signature.
 */
export function updateClaimAllocationStatus(
  id: number,
  status: ClaimAllocationStatus,
  submitterTxSignature?: string
): boolean {
  const stmt = db.prepare(`
    UPDATE claim_allocations
    SET status = ?, submitter_tx_signature = COALESCE(?, submitter_tx_signature)
    WHERE id = ?
  `);
  const result = stmt.run(status, submitterTxSignature ?? null, id);
  return result.changes > 0;
}

/**
 * Get all allocations for a claim batch.
 */
export function getClaimAllocationsByBatch(batchId: number): ClaimAllocation[] {
  const stmt = db.prepare(`
    SELECT * FROM claim_allocations
    WHERE batch_id = ?
    ORDER BY share_percent DESC
  `);
  return stmt.all(batchId) as ClaimAllocation[];
}

/**
 * Get the most recent volume snapshot for a token.
 */
export function getLastVolumeSnapshot(tokenId: number): TokenVolumeSnapshot | undefined {
  const stmt = db.prepare(`
    SELECT * FROM token_volume_snapshots
    WHERE token_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `);
  return stmt.get(tokenId) as TokenVolumeSnapshot | undefined;
}

/**
 * Save a volume snapshot for a token.
 */
export function saveVolumeSnapshot(
  tokenId: number,
  cumulativeVolume: number,
  source: string = "pump_api"
): TokenVolumeSnapshot {
  const stmt = db.prepare(`
    INSERT INTO token_volume_snapshots (token_id, cumulative_volume, snapshot_source)
    VALUES (?, ?, ?)
    RETURNING *
  `);
  return stmt.get(tokenId, cumulativeVolume, source) as TokenVolumeSnapshot;
}

/**
 * Get claim distribution summary for display/reporting.
 */
export function getClaimDistributionSummary(batchId: number): Array<{
  token_id: number;
  token_name: string;
  ticker: string;
  mint_address: string | null;
  deployer_sol_address: string;
  volume_snapshot: number;
  share_percent: number;
  amount_lamports: number;
  submitter_lamports: number;
  submitter_tx_signature: string | null;
  allocation_status: string;
}> {
  const stmt = db.prepare(`
    SELECT
      ca.token_id,
      t.token_name,
      t.ticker,
      t.mint_address,
      t.deployer_sol_address,
      ca.volume_snapshot,
      ca.share_percent,
      ca.amount_lamports,
      ca.submitter_lamports,
      ca.submitter_tx_signature,
      ca.status as allocation_status
    FROM claim_allocations ca
    JOIN tokens t ON ca.token_id = t.id
    WHERE ca.batch_id = ?
    ORDER BY ca.share_percent DESC
  `);
  return stmt.all(batchId) as Array<{
    token_id: number;
    token_name: string;
    ticker: string;
    mint_address: string | null;
    deployer_sol_address: string;
    volume_snapshot: number;
    share_percent: number;
    amount_lamports: number;
    submitter_lamports: number;
    submitter_tx_signature: string | null;
    allocation_status: string;
  }>;
}

// ============= COMMENTS =============

export interface CommentRow {
  id: number;
  headline_id: number;
  telegram_user_id: string;
  telegram_username: string | null;
  telegram_first_name: string | null;
  content: string;
  created_at: string;
}

/**
 * Get comments for a headline, newest first.
 */
export function getComments(headlineId: number, limit: number = 50): CommentRow[] {
  const stmt = db.prepare(`
    SELECT * FROM comments
    WHERE headline_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(headlineId, limit) as CommentRow[];
}

/**
 * Add a comment to a headline.
 */
export function addComment(
  headlineId: number,
  telegramUserId: string,
  content: string,
  telegramUsername?: string,
  telegramFirstName?: string
): CommentRow {
  const stmt = db.prepare(`
    INSERT INTO comments (headline_id, telegram_user_id, telegram_username, telegram_first_name, content)
    VALUES (?, ?, ?, ?, ?)
    RETURNING *
  `);
  return stmt.get(headlineId, telegramUserId, telegramUsername || null, telegramFirstName || null, content) as CommentRow;
}

// ============= SETTINGS =============

/**
 * Get a setting value by key. Returns null if not set.
 */
export function getSetting(key: string): string | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

/**
 * Set a setting value (upsert).
 */
export function setSetting(key: string, value: string): void {
  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(key, value);
}

// ============= TOP EARNERS =============

export interface TopEarner {
  telegram_username: string | null;
  telegram_user_id: string;
  sol_address: string;
  total_earned_lamports: number;
  revenue_events_count: number;
}

/**
 * Get top earners by SOL earned, with an optional time period filter.
 * @param period - 'day' | 'week' | 'month' | 'all'
 */
export function getTopEarners(period: string = "all", limit: number = 15): TopEarner[] {
  let dateFilter = "";
  if (period === "day") {
    dateFilter = "AND re.created_at >= datetime('now', '-1 day')";
  } else if (period === "week") {
    dateFilter = "AND re.created_at >= datetime('now', '-7 days')";
  } else if (period === "month") {
    dateFilter = "AND re.created_at >= datetime('now', '-30 days')";
  }

  const stmt = db.prepare(`
    SELECT
      s.telegram_username,
      s.telegram_user_id,
      s.sol_address,
      SUM(re.submitter_share_lamports) as total_earned_lamports,
      COUNT(DISTINCT re.id) as revenue_events_count
    FROM revenue_events re
    JOIN tokens t ON re.token_id = t.id
    JOIN submissions s ON t.submission_id = s.id
    WHERE re.status IN ('submitter_paid', 'completed')
      ${dateFilter}
    GROUP BY s.telegram_user_id
    ORDER BY total_earned_lamports DESC
    LIMIT ?
  `);
  return stmt.all(limit) as TopEarner[];
}

export default db;
