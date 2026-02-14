/**
 * Wallet Audit Log — structured, tamper-evident logging of every wallet operation.
 *
 * Stores entries in the same SQLite database used by the rest of the app.
 * Provides query helpers used by the guardrails module (daily outflow) and
 * an admin-facing getAuditLog() for forensics.
 */

import db from "./db";

// ---------------------------------------------------------------------------
// Table initialisation (runs once on import, idempotent)
// ---------------------------------------------------------------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS wallet_audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    operation   TEXT NOT NULL CHECK(operation IN (
      'send_sol', 'deploy_token', 'buy_burn', 'burn_tokens',
      'balance_check', 'wallet_access', 'guardrail_block',
      'claim_creator_fee'
    )),
    amount_lamports INTEGER DEFAULT 0,
    destination     TEXT,
    tx_signature    TEXT,
    caller          TEXT NOT NULL,
    success         INTEGER NOT NULL DEFAULT 1,
    error_message   TEXT,
    metadata        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_wallet_audit_timestamp
    ON wallet_audit_log(timestamp);

  CREATE INDEX IF NOT EXISTS idx_wallet_audit_operation
    ON wallet_audit_log(operation);
`);

// Migration: Recreate wallet_audit_log if the CHECK constraint is missing
// 'claim_creator_fee'. SQLite doesn't support ALTER COLUMN, so we must
// recreate the table and copy data across.
{
  const tableInfo = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='wallet_audit_log'"
    )
    .get() as { sql: string } | undefined;

  if (tableInfo && !tableInfo.sql.includes("claim_creator_fee")) {
    db.exec(`
      CREATE TABLE wallet_audit_log_new (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp   DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        operation   TEXT NOT NULL CHECK(operation IN (
          'send_sol', 'deploy_token', 'buy_burn', 'burn_tokens',
          'balance_check', 'wallet_access', 'guardrail_block',
          'claim_creator_fee'
        )),
        amount_lamports INTEGER DEFAULT 0,
        destination     TEXT,
        tx_signature    TEXT,
        caller          TEXT NOT NULL,
        success         INTEGER NOT NULL DEFAULT 1,
        error_message   TEXT,
        metadata        TEXT
      );

      INSERT INTO wallet_audit_log_new
        SELECT * FROM wallet_audit_log;

      DROP TABLE wallet_audit_log;

      ALTER TABLE wallet_audit_log_new RENAME TO wallet_audit_log;

      CREATE INDEX IF NOT EXISTS idx_wallet_audit_timestamp
        ON wallet_audit_log(timestamp);

      CREATE INDEX IF NOT EXISTS idx_wallet_audit_operation
        ON wallet_audit_log(operation);
    `);
    console.log("[WalletAudit] Migrated CHECK constraint to include claim_creator_fee");
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AuditOperation =
  | "send_sol"
  | "deploy_token"
  | "buy_burn"
  | "burn_tokens"
  | "balance_check"
  | "wallet_access"
  | "guardrail_block"
  | "claim_creator_fee";

export interface AuditEntry {
  id: number;
  timestamp: string;
  operation: AuditOperation;
  amount_lamports: number;
  destination: string | null;
  tx_signature: string | null;
  caller: string;
  success: boolean;
  error_message: string | null;
  metadata: string | null;
}

export interface LogWalletOperationParams {
  operation: AuditOperation;
  amountLamports?: number;
  destination?: string;
  txSignature?: string;
  caller: string;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Prepared statements
// ---------------------------------------------------------------------------

const insertStmt = db.prepare(`
  INSERT INTO wallet_audit_log
    (operation, amount_lamports, destination, tx_signature, caller, success, error_message, metadata)
  VALUES
    (@operation, @amountLamports, @destination, @txSignature, @caller, @success, @errorMessage, @metadata)
`);

const selectRecentStmt = db.prepare(`
  SELECT * FROM wallet_audit_log
  ORDER BY id DESC
  LIMIT @limit OFFSET @offset
`);

const selectByOperationStmt = db.prepare(`
  SELECT * FROM wallet_audit_log
  WHERE operation = @operation
  ORDER BY id DESC
  LIMIT @limit OFFSET @offset
`);

const dailyOutflowStmt = db.prepare(`
  SELECT COALESCE(SUM(amount_lamports), 0) AS total
  FROM wallet_audit_log
  WHERE operation IN ('send_sol', 'deploy_token', 'buy_burn')
    AND success = 1
    AND timestamp >= datetime('now', '-24 hours')
`);

const txCountLastMinuteStmt = db.prepare(`
  SELECT COUNT(*) AS cnt
  FROM wallet_audit_log
  WHERE operation IN ('send_sol', 'deploy_token', 'buy_burn', 'burn_tokens')
    AND success = 1
    AND timestamp >= datetime('now', '-1 minutes')
`);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Log a wallet operation. Called by the secure-wallet facade on every action.
 */
export function logWalletOperation(params: LogWalletOperationParams): void {
  try {
    insertStmt.run({
      operation: params.operation,
      amountLamports: params.amountLamports ?? 0,
      destination: params.destination ?? null,
      txSignature: params.txSignature ?? null,
      caller: params.caller,
      success: params.success ? 1 : 0,
      errorMessage: params.errorMessage ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });
  } catch (error) {
    // Audit logging must never crash the main flow — log to stderr and continue.
    console.error("[WalletAudit] Failed to write audit log:", error);
  }
}

/**
 * Sum of all successful outbound lamports in the last 24 hours.
 * Used by wallet-guardrails to enforce the daily spending cap.
 */
export function getDailyOutflowLamports(): number {
  const row = dailyOutflowStmt.get() as { total: number } | undefined;
  return row?.total ?? 0;
}

/**
 * Number of successful outbound transactions in the last 60 seconds.
 * Used by wallet-guardrails for rate limiting.
 */
export function getRecentTxCount(): number {
  const row = txCountLastMinuteStmt.get() as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

/**
 * Query the audit log for display / forensics.
 */
export function getAuditLog(options: {
  operation?: AuditOperation;
  limit?: number;
  offset?: number;
}): AuditEntry[] {
  const limit = Math.min(options.limit ?? 50, 500);
  const offset = options.offset ?? 0;

  let rows: unknown[];

  if (options.operation) {
    rows = selectByOperationStmt.all({
      operation: options.operation,
      limit,
      offset,
    });
  } else {
    rows = selectRecentStmt.all({ limit, offset });
  }

  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as number,
    timestamp: r.timestamp as string,
    operation: r.operation as AuditOperation,
    amount_lamports: r.amount_lamports as number,
    destination: r.destination as string | null,
    tx_signature: r.tx_signature as string | null,
    caller: r.caller as string,
    success: r.success === 1,
    error_message: r.error_message as string | null,
    metadata: r.metadata as string | null,
  }));
}
