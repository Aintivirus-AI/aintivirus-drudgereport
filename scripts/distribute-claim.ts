/**
 * Distribute Claim — CLI tool for fair pump.fun bulk claim distribution.
 *
 * Calculates and distributes SOL from a pump.fun bulk claim across all
 * active tokens proportionally based on trading volume.
 *
 * Usage:
 *   npx tsx scripts/distribute-claim.ts --dry-run              # Preview distribution (safe, read-only)
 *   npx tsx scripts/distribute-claim.ts --tx <signature>        # Distribute a specific claim tx
 *   npx tsx scripts/distribute-claim.ts --tx <sig> --dry-run    # Preview distribution for a specific tx
 *   npx tsx scripts/distribute-claim.ts --status                # Show all claim batches
 *   npx tsx scripts/distribute-claim.ts --retry <batchId>       # Retry failed allocations in a batch
 *
 * Environment:
 *   Requires the same .env / .env.local as the main app (wallet keys, RPC, etc.)
 */

import dotenv from "dotenv";
import path from "path";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

// Load env vars (must happen before any lib imports that read process.env)
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import {
  distributeBulkClaim,
  fetchTokenVolumes,
  calculateProRataShares,
  retryFailedAllocations,
} from "../lib/claim-distributor";
import {
  getActiveTokensForClaim,
  getAllClaimBatches,
  getClaimDistributionSummary,
  getClaimBatchById,
  getPendingClaimBatches,
} from "../lib/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(6);
}

function printHeader(text: string): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${text}`);
  console.log(`${"=".repeat(60)}\n`);
}

function printTable(
  rows: Array<Record<string, string | number>>,
  columns: Array<{ key: string; label: string; width: number }>
): void {
  // Header
  const header = columns.map((c) => c.label.padEnd(c.width)).join(" | ");
  console.log(header);
  console.log(columns.map((c) => "-".repeat(c.width)).join("-+-"));

  // Rows
  for (const row of rows) {
    const line = columns
      .map((c) => String(row[c.key] ?? "").padEnd(c.width))
      .join(" | ");
    console.log(line);
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdDryRun(txSignature?: string): Promise<void> {
  printHeader("Dry Run — Preview Distribution");

  const tokens = getActiveTokensForClaim();
  if (tokens.length === 0) {
    console.log("No active tokens with mint addresses found.");
    return;
  }

  const heliusAvailable = !!process.env.HELIUS_API_KEY;
  const source = heliusAvailable ? "Helius SOL volume" : "pump.fun market cap";
  console.log(`Found ${tokens.length} active token(s). Fetching activity data (${source})...\n`);

  const volumes = await fetchTokenVolumes(tokens);

  // Show activity data
  const volumeRows = volumes.map((v) => {
    const token = tokens.find((t) => t.id === v.tokenId);
    return {
      ticker: token?.ticker || `#${v.tokenId}`,
      mint: v.mintAddress.slice(0, 12) + "…",
      current: v.currentVolume.toFixed(4),
      previous: v.previousVolume.toFixed(4),
      delta: v.volumeDelta.toFixed(4),
    };
  });

  const activityLabel = heliusAvailable ? "SOL Vol" : "Mkt Cap";
  printTable(volumeRows, [
    { key: "ticker", label: "Ticker", width: 12 },
    { key: "mint", label: "Mint", width: 16 },
    { key: "current", label: `Curr ${activityLabel}`, width: 16 },
    { key: "previous", label: `Prev ${activityLabel}`, width: 16 },
    { key: "delta", label: "Delta", width: 16 },
  ]);

  // Calculate shares with a placeholder amount (1 SOL) to show percentages
  const placeholderLamports = 1 * LAMPORTS_PER_SOL;
  const shares = calculateProRataShares(volumes, tokens, placeholderLamports);

  console.log("\nPro-rata share breakdown (if 1 SOL were distributed):\n");

  const shareRows = shares.map((s) => {
    const token = tokens.find((t) => t.id === s.tokenId);
    return {
      ticker: token?.ticker || `#${s.tokenId}`,
      share: `${(s.sharePercent * 100).toFixed(2)}%`,
      total: `${formatSol(s.totalAmountLamports)} SOL`,
      submitter: `${formatSol(s.submitterLamports)} SOL`,
      wallet: s.deployerSolAddress.slice(0, 12) + "…",
    };
  });

  printTable(shareRows, [
    { key: "ticker", label: "Ticker", width: 12 },
    { key: "share", label: "Share %", width: 10 },
    { key: "total", label: "Total", width: 16 },
    { key: "submitter", label: "To Submitter", width: 16 },
    { key: "wallet", label: "Wallet", width: 16 },
  ]);

  // If a tx signature was given, do a full dry-run with amount detection
  if (txSignature) {
    console.log(`\nNote: --dry-run with --tx does not fetch on-chain amounts.`);
    console.log(`To distribute, run without --dry-run:`);
    console.log(`  npx tsx scripts/distribute-claim.ts --tx ${txSignature}\n`);
  } else {
    console.log("\nThis is a dry run. No SOL was sent and no records were created.");
    console.log("To distribute a specific claim, use:");
    console.log("  npx tsx scripts/distribute-claim.ts --tx <signature>\n");
  }
}

async function cmdDistribute(txSignature: string, amountSol?: number): Promise<void> {
  printHeader("Distribute Bulk Claim");

  if (!amountSol) {
    console.log("You must specify the claim amount with --amount <sol>.");
    console.log("Example:");
    console.log(`  npx tsx scripts/distribute-claim.ts --tx ${txSignature} --amount 2.5\n`);
    process.exit(1);
  }

  const totalLamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
  console.log(`Transaction: ${txSignature}`);
  console.log(`Amount: ${amountSol} SOL (${totalLamports.toLocaleString()} lamports)\n`);

  console.log("Starting distribution...\n");

  const result = await distributeBulkClaim(txSignature, totalLamports, false);

  if (result.success) {
    console.log(`\nDistribution complete!`);
    console.log(`  Batch ID: ${result.batchId}`);
    console.log(`  Tokens: ${result.tokensCount}`);
    console.log(`  Distributed: ${formatSol(result.distributedLamports || 0)} SOL`);

    if (result.batchId) {
      console.log(`\nAllocation details:\n`);
      const summary = getClaimDistributionSummary(result.batchId);
      const rows = summary.map((s) => ({
        ticker: s.ticker,
        share: `${(s.share_percent * 100).toFixed(2)}%`,
        amount: `${formatSol(s.amount_lamports)} SOL`,
        submitter: `${formatSol(s.submitter_lamports)} SOL`,
        status: s.allocation_status,
        tx: s.submitter_tx_signature?.slice(0, 12) || "-",
      }));

      printTable(rows, [
        { key: "ticker", label: "Ticker", width: 12 },
        { key: "share", label: "Share", width: 10 },
        { key: "amount", label: "Total", width: 16 },
        { key: "submitter", label: "Submitter", width: 16 },
        { key: "status", label: "Status", width: 10 },
        { key: "tx", label: "Tx", width: 14 },
      ]);
    }
  } else {
    console.error(`\nDistribution failed: ${result.error}`);
    process.exit(1);
  }
}

async function cmdStatus(): Promise<void> {
  printHeader("Claim Batch Status");

  const batches = getAllClaimBatches(20);
  if (batches.length === 0) {
    console.log("No claim batches found.\n");
    return;
  }

  const rows = batches.map((b) => ({
    id: String(b.id),
    tx: b.tx_signature.slice(0, 16) + "…",
    total: `${formatSol(b.total_lamports)} SOL`,
    distributed: `${formatSol(b.distributed_lamports)} SOL`,
    tokens: String(b.tokens_count),
    status: b.status,
    created: b.created_at,
  }));

  printTable(rows, [
    { key: "id", label: "ID", width: 4 },
    { key: "tx", label: "Transaction", width: 20 },
    { key: "total", label: "Total", width: 16 },
    { key: "distributed", label: "Distributed", width: 16 },
    { key: "tokens", label: "Tokens", width: 8 },
    { key: "status", label: "Status", width: 14 },
    { key: "created", label: "Created", width: 20 },
  ]);

  // Show details for the most recent batch
  if (batches.length > 0) {
    console.log(`\nMost recent batch (#${batches[0].id}) allocations:\n`);
    const summary = getClaimDistributionSummary(batches[0].id);
    if (summary.length > 0) {
      const allocRows = summary.map((s) => ({
        ticker: s.ticker,
        share: `${(s.share_percent * 100).toFixed(2)}%`,
        amount: `${formatSol(s.amount_lamports)} SOL`,
        submitter: `${formatSol(s.submitter_lamports)} SOL`,
        wallet: s.deployer_sol_address.slice(0, 12) + "…",
        status: s.allocation_status,
      }));

      printTable(allocRows, [
        { key: "ticker", label: "Ticker", width: 12 },
        { key: "share", label: "Share", width: 10 },
        { key: "amount", label: "Total", width: 16 },
        { key: "submitter", label: "Submitter", width: 16 },
        { key: "wallet", label: "Wallet", width: 16 },
        { key: "status", label: "Status", width: 10 },
      ]);
    } else {
      console.log("  No allocations found for this batch.");
    }
  }

  console.log("");
}

async function cmdRetry(batchId: number): Promise<void> {
  printHeader(`Retry Failed Allocations — Batch #${batchId}`);

  const batch = getClaimBatchById(batchId);
  if (!batch) {
    console.error(`Batch #${batchId} not found.`);
    process.exit(1);
  }

  console.log(`Batch #${batchId}: ${formatSol(batch.total_lamports)} SOL, status: ${batch.status}\n`);

  const result = await retryFailedAllocations(batchId);

  console.log(`\nRetry results:`);
  console.log(`  Retried:   ${result.retried}`);
  console.log(`  Succeeded: ${result.succeeded}`);
  console.log(`  Failed:    ${result.failed}\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const hasFlag = (flag: string) => args.includes(flag);
  const getFlagValue = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
  };

  const isDryRun = hasFlag("--dry-run");
  const isStatus = hasFlag("--status");
  const txSignature = getFlagValue("--tx");
  const retryBatchId = getFlagValue("--retry");
  const amountSolStr = getFlagValue("--amount");
  const amountSol = amountSolStr ? parseFloat(amountSolStr) : undefined;

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║    Pump.fun Bulk Claim Distributor           ║");
  console.log("╚══════════════════════════════════════════════╝");

  if (isStatus) {
    await cmdStatus();
  } else if (retryBatchId) {
    const batchId = parseInt(retryBatchId, 10);
    if (isNaN(batchId)) {
      console.error("Invalid batch ID. Usage: --retry <batchId>");
      process.exit(1);
    }
    await cmdRetry(batchId);
  } else if (isDryRun) {
    await cmdDryRun(txSignature);
  } else if (txSignature) {
    await cmdDistribute(txSignature, amountSol);
  } else {
    // No flags — show help
    console.log("\nUsage:");
    console.log("  npx tsx scripts/distribute-claim.ts --dry-run");
    console.log("    Preview volume data and distribution percentages (safe, read-only)\n");
    console.log("  npx tsx scripts/distribute-claim.ts --tx <signature> --amount <sol>");
    console.log("    Distribute a specific claim transaction\n");
    console.log("  npx tsx scripts/distribute-claim.ts --tx <signature> --amount <sol> --dry-run");
    console.log("    Preview distribution for a specific claim (no SOL sent)\n");
    console.log("  npx tsx scripts/distribute-claim.ts --status");
    console.log("    Show all claim batches and their allocations\n");
    console.log("  npx tsx scripts/distribute-claim.ts --retry <batchId>");
    console.log("    Retry failed allocations in a batch\n");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
