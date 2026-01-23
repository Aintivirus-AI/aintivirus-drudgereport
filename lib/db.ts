import Database from "better-sqlite3";
import path from "path";
import type { Headline, MainHeadlineData, WhitelistUser } from "./types";

// Database path
const dbPath = path.join(process.cwd(), "data", "headlines.db");

// Create/open database
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");

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

  -- Whitelist table for Telegram users
  CREATE TABLE IF NOT EXISTS whitelist (
    telegram_id TEXT PRIMARY KEY,
    username TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Create indexes for better query performance
  CREATE INDEX IF NOT EXISTS idx_headlines_column ON headlines(column);
  CREATE INDEX IF NOT EXISTS idx_headlines_created_at ON headlines(created_at DESC);
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
 */
export function getHeadlines(
  column: "left" | "right" | "center",
  limit: number = 25
): Headline[] {
  const stmt = db.prepare(`
    SELECT id, title, url, column, image_url, created_at
    FROM headlines
    WHERE column = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(column, limit) as Headline[];
}

/**
 * Get all headlines across all columns
 */
export function getAllHeadlines(limit: number = 100): Headline[] {
  const stmt = db.prepare(`
    SELECT id, title, url, column, image_url, created_at
    FROM headlines
    ORDER BY created_at DESC
    LIMIT ?
  `);
  return stmt.all(limit) as Headline[];
}

/**
 * Add a new headline
 */
export function addHeadline(
  title: string,
  url: string,
  column: "left" | "right" = "left",
  imageUrl?: string
): Headline {
  const stmt = db.prepare(`
    INSERT INTO headlines (title, url, column, image_url)
    VALUES (?, ?, ?, ?)
    RETURNING id, title, url, column, image_url, created_at
  `);
  return stmt.get(title, url, column, imageUrl || null) as Headline;
}

/**
 * Remove a headline by ID
 */
export function removeHeadline(id: number): boolean {
  const stmt = db.prepare("DELETE FROM headlines WHERE id = ?");
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Get a headline by ID
 */
export function getHeadlineById(id: number): Headline | undefined {
  const stmt = db.prepare(`
    SELECT id, title, url, column, image_url, created_at
    FROM headlines
    WHERE id = ?
  `);
  return stmt.get(id) as Headline | undefined;
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

// ============= UTILITY =============

/**
 * Clean up old headlines (optional maintenance function)
 */
export function cleanupOldHeadlines(keepCount: number = 100): number {
  // Get IDs to keep (most recent `keepCount` per column)
  const stmt = db.prepare(`
    DELETE FROM headlines
    WHERE id NOT IN (
      SELECT id FROM (
        SELECT id FROM headlines WHERE column = 'left' ORDER BY created_at DESC LIMIT ?
        UNION ALL
        SELECT id FROM headlines WHERE column = 'right' ORDER BY created_at DESC LIMIT ?
        UNION ALL
        SELECT id FROM headlines WHERE column = 'center' ORDER BY created_at DESC LIMIT ?
      )
    )
  `);
  const result = stmt.run(keepCount, keepCount, keepCount);
  return result.changes;
}

export default db;
