/**
 * Revenue Report — shows what each submitter wallet is owed.
 *
 * Queries all tokens, their associated submissions, and the revenue
 * events to produce a breakdown of:
 *   - What has already been paid out
 *   - What is still pending/owed
 *   - A per-wallet summary
 *
 * Usage:
 *   npx tsx scripts/revenue-report.ts              # full report
 *   npx tsx scripts/revenue-report.ts --unpaid     # only show unpaid balances
 *   npx tsx scripts/revenue-report.ts --summary    # wallet summary only
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import db from "../lib/db";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

const args = process.argv.slice(2);
const unpaidOnly = args.includes("--unpaid");
const summaryOnly = args.includes("--summary");

interface TokenRow {
  token_id: number;
  ticker: string;
  token_name: string;
  mint_address: string | null;
  submitter_wallet: string | null;
  telegram_username: string | null;
  created_at: string;
  total_revenue_lamports: number;
  paid_to_submitter_lamports: number;
  pending_lamports: number;
  failed_lamports: number;
  revenue_events: number;
}

// Per-token revenue breakdown
const tokenRows = db.prepare(`
  SELECT
    t.id as token_id,
    t.ticker,
    t.token_name,
    t.mint_address,
    s.sol_address as submitter_wallet,
    s.telegram_username,
    t.created_at,
    COALESCE(SUM(re.amount_lamports), 0) as total_revenue_lamports,
    COALESCE(SUM(
      CASE WHEN re.status IN ('submitter_paid', 'completed')
      THEN re.submitter_share_lamports ELSE 0 END
    ), 0) as paid_to_submitter_lamports,
    COALESCE(SUM(
      CASE WHEN re.status = 'pending'
      THEN re.submitter_share_lamports ELSE 0 END
    ), 0) as pending_lamports,
    COALESCE(SUM(
      CASE WHEN re.status = 'failed'
      THEN re.submitter_share_lamports ELSE 0 END
    ), 0) as failed_lamports,
    COUNT(re.id) as revenue_events
  FROM tokens t
  LEFT JOIN submissions s ON t.submission_id = s.id
  LEFT JOIN revenue_events re ON re.token_id = t.id
  GROUP BY t.id
  ORDER BY total_revenue_lamports DESC
`).all() as TokenRow[];

// Also get claim_allocations data (from bulk claims)
interface ClaimRow {
  token_id: number;
  ticker: string;
  submitter_wallet: string | null;
  telegram_username: string | null;
  total_allocated_lamports: number;
  total_submitter_lamports: number;
  paid_lamports: number;
  pending_lamports: number;
}

const claimRows = db.prepare(`
  SELECT
    t.id as token_id,
    t.ticker,
    s.sol_address as submitter_wallet,
    s.telegram_username,
    COALESCE(SUM(ca.amount_lamports), 0) as total_allocated_lamports,
    COALESCE(SUM(ca.submitter_lamports), 0) as total_submitter_lamports,
    COALESCE(SUM(
      CASE WHEN ca.status = 'paid' THEN ca.submitter_lamports ELSE 0 END
    ), 0) as paid_lamports,
    COALESCE(SUM(
      CASE WHEN ca.status = 'pending' THEN ca.submitter_lamports ELSE 0 END
    ), 0) as pending_lamports
  FROM claim_allocations ca
  JOIN tokens t ON ca.token_id = t.id
  LEFT JOIN submissions s ON t.submission_id = s.id
  GROUP BY t.id
  HAVING total_allocated_lamports > 0
  ORDER BY total_allocated_lamports DESC
`).all() as ClaimRow[];

const sol = (lamports: number) => (lamports / LAMPORTS_PER_SOL).toFixed(6);

// Build per-wallet summary
interface WalletSummary {
  wallet: string;
  username: string | null;
  totalRevenue: number;
  alreadyPaid: number;
  pendingOwed: number;
  failedOwed: number;
  claimAllocated: number;
  claimPaid: number;
  claimPending: number;
  tokenCount: number;
}

const walletMap = new Map<string, WalletSummary>();

for (const row of tokenRows) {
  const wallet = row.submitter_wallet || "unknown";
  if (!walletMap.has(wallet)) {
    walletMap.set(wallet, {
      wallet,
      username: row.telegram_username,
      totalRevenue: 0,
      alreadyPaid: 0,
      pendingOwed: 0,
      failedOwed: 0,
      claimAllocated: 0,
      claimPaid: 0,
      claimPending: 0,
      tokenCount: 0,
    });
  }
  const w = walletMap.get(wallet)!;
  w.totalRevenue += row.total_revenue_lamports;
  w.alreadyPaid += row.paid_to_submitter_lamports;
  w.pendingOwed += row.pending_lamports;
  w.failedOwed += row.failed_lamports;
  w.tokenCount++;
}

for (const row of claimRows) {
  const wallet = row.submitter_wallet || "unknown";
  if (!walletMap.has(wallet)) {
    walletMap.set(wallet, {
      wallet,
      username: row.telegram_username,
      totalRevenue: 0,
      alreadyPaid: 0,
      pendingOwed: 0,
      failedOwed: 0,
      claimAllocated: 0,
      claimPaid: 0,
      claimPending: 0,
      tokenCount: 0,
    });
  }
  const w = walletMap.get(wallet)!;
  w.claimAllocated += row.total_submitter_lamports;
  w.claimPaid += row.paid_lamports;
  w.claimPending += row.pending_lamports;
}

// ── Print report ──

console.log("\n" + "=".repeat(100));
console.log("  REVENUE REPORT");
console.log("=".repeat(100));

// ── Per-token detail ──
if (!summaryOnly) {
  const rows = unpaidOnly
    ? tokenRows.filter((r) => r.pending_lamports > 0 || r.failed_lamports > 0)
    : tokenRows.filter((r) => r.total_revenue_lamports > 0);

  console.log(`\n--- Per-Token Breakdown (${rows.length} tokens with revenue) ---\n`);

  for (const row of rows) {
    console.log(`${row.ticker} (${row.token_name}) — Token #${row.token_id}`);
    console.log(`  Submitter:     ${row.submitter_wallet || "N/A"} ${row.telegram_username ? `(@${row.telegram_username})` : ""}`);
    console.log(`  Total Revenue: ${sol(row.total_revenue_lamports)} SOL (${row.revenue_events} events)`);
    console.log(`  Already Paid:  ${sol(row.paid_to_submitter_lamports)} SOL`);
    if (row.pending_lamports > 0) {
      console.log(`  Pending/Owed:  ${sol(row.pending_lamports)} SOL  ⚠️`);
    }
    if (row.failed_lamports > 0) {
      console.log(`  Failed:        ${sol(row.failed_lamports)} SOL  ❌`);
    }
    console.log("");
  }
}

// ── Per-wallet summary ──
const wallets = Array.from(walletMap.values())
  .filter((w) => w.wallet !== "unknown")
  .sort((a, b) => (b.totalRevenue + b.claimAllocated) - (a.totalRevenue + a.claimAllocated));

const walletsToShow = unpaidOnly
  ? wallets.filter((w) => w.pendingOwed > 0 || w.failedOwed > 0 || w.claimPending > 0)
  : wallets;

console.log(`\n--- Wallet Summary (${walletsToShow.length} wallets) ---\n`);

let grandTotalPaid = 0;
let grandTotalOwed = 0;

for (const w of walletsToShow) {
  const totalOwed = w.pendingOwed + w.failedOwed + w.claimPending;
  const totalPaid = w.alreadyPaid + w.claimPaid;
  grandTotalPaid += totalPaid;
  grandTotalOwed += totalOwed;

  console.log(`Wallet:  ${w.wallet}`);
  if (w.username) console.log(`User:    @${w.username}`);
  console.log(`Tokens:  ${w.tokenCount}`);
  console.log(`Paid:    ${sol(totalPaid)} SOL`);
  if (totalOwed > 0) {
    console.log(`Owed:    ${sol(totalOwed)} SOL  ⚠️`);
  }
  console.log("-".repeat(80));
}

console.log(`\n${"=".repeat(100)}`);
console.log(`  TOTALS`);
console.log(`  Already paid out:  ${sol(grandTotalPaid)} SOL`);
console.log(`  Still owed:        ${sol(grandTotalOwed)} SOL`);
console.log(`${"=".repeat(100)}\n`);
