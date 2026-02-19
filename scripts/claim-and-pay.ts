/**
 * Claim & Pay — distribute pump.fun creator fees to submitters.
 *
 * The automated scheduler claims fees every 30 min and logs the amounts.
 * This script totals up everything claimed since the last distribution
 * and pays submitters their share pro-rata by trading volume.
 *
 * Usage:
 *   npx tsx scripts/claim-and-pay.ts                  # distribute what's owed
 *   npx tsx scripts/claim-and-pay.ts --dry-run        # preview only, no payments sent
 *   npx tsx scripts/claim-and-pay.ts --amount 0.5     # override amount (instead of auto-detect)
 *   npx tsx scripts/claim-and-pay.ts --claim           # also claim fees before distributing
 */

import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getConnection } from "../lib/solana-wallet";
import { secureGetWallet, secureGetBalance } from "../lib/secure-wallet";
import { callCollectCreatorFee } from "../lib/creator-fee-claimer";
import {
  distributeBulkClaim,
  fetchTokenVolumes,
  calculateProRataShares,
} from "../lib/claim-distributor";
import {
  getActiveTokensForClaim,
  getClaimDistributionSummary,
  getUndistrbutedClaimTotal,
} from "../lib/db";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const doClaim = args.includes("--claim");

function getFlag(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}

function sol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(6);
}

function hr(char = "═", len = 60): string {
  return char.repeat(len);
}

function shortDate(raw: string): string {
  const d = new Date(raw.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "n/a";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

async function main(): Promise<void> {
  console.log(`\n${hr()}`);
  console.log(`  CLAIM & PAY${isDryRun ? "  [DRY RUN]" : ""}`);
  console.log(hr());

  const balance = await secureGetBalance("claim-and-pay");
  console.log(`\nMaster wallet balance: ${sol(balance.lamports)} SOL`);

  // ── Step 1: Optionally claim fees first ──
  if (doClaim) {
    console.log(`\nClaiming creator fees from pump.fun...`);

    const connection = getConnection();
    const wallet = secureGetWallet("claim-and-pay");
    const balanceBefore = balance.lamports;

    try {
      const signature = await callCollectCreatorFee(connection, wallet);
      console.log(`  Claim tx: ${signature}`);

      await new Promise((r) => setTimeout(r, 3000));
      const after = await secureGetBalance("claim-and-pay:after");
      const diff = Math.max(0, after.lamports - balanceBefore);

      if (diff > 0) {
        console.log(`  Received: ${sol(diff)} SOL`);
      } else {
        console.log(`  No new fees to claim.`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("400") || msg.includes("500") || msg.includes("No fees")) {
        console.log(`  No fees to claim.`);
      } else {
        console.error(`  Claim failed: ${msg}`);
        process.exit(1);
      }
    }
  }

  // ── Step 2: Determine distribution amount ──
  let distributionLamports = 0;
  const amountStr = getFlag("--amount");

  if (amountStr) {
    const parsed = parseFloat(amountStr);
    if (isNaN(parsed) || parsed <= 0) {
      console.error(`\nInvalid --amount: "${amountStr}". Must be a positive number.\n`);
      process.exit(1);
    }
    distributionLamports = Math.floor(parsed * LAMPORTS_PER_SOL);
    console.log(`\nUsing manual amount: ${sol(distributionLamports)} SOL`);
  } else {
    // Auto-detect: sum all fees claimed since last distribution
    const undistributed = getUndistrbutedClaimTotal();

    console.log(`\nFees claimed since last distribution:`);
    console.log(`  Claims:  ${undistributed.claimCount} successful claim(s)`);
    console.log(`  Total:   ${sol(undistributed.lamports)} SOL`);
    if (undistributed.since) {
      console.log(`  Since:   ${undistributed.since}`);
    } else {
      console.log(`  Since:   (first distribution — all time)`);
    }

    distributionLamports = undistributed.lamports;
  }

  if (distributionLamports <= 0) {
    console.log(`\nNothing to distribute (0 SOL claimed since last payout).`);
    console.log(`If the automated claimer just started recording amounts, run with --amount to distribute manually.\n`);
    return;
  }

  // ── Step 3: Fetch tokens and calculate shares ──
  const tokens = getActiveTokensForClaim();
  if (tokens.length === 0) {
    console.log(`\nNo active tokens with mint addresses. Nothing to distribute.\n`);
    return;
  }

  console.log(`\n${hr("─")}`);
  console.log(`  Distributing ${sol(distributionLamports)} SOL across ${tokens.length} token(s)`);
  console.log(hr("─"));

  const volumes = await fetchTokenVolumes(tokens);
  const shares = calculateProRataShares(volumes, tokens, distributionLamports);

  if (shares.length === 0) {
    console.log(`\n  No tokens qualify (zero trading volume).\n`);
    return;
  }

  // ── Step 4: Show breakdown ──
  console.log("");
  for (const s of shares) {
    const token = tokens.find((t) => t.id === s.tokenId);
    const created = token?.created_at ? shortDate(token.created_at) : "n/a";
    console.log(
      `  ${(token?.ticker || `#${s.tokenId}`).padEnd(12)} ` +
      `${created.padEnd(8)} ` +
      `${(s.sharePercent * 100).toFixed(1).padStart(5)}%  ` +
      `${sol(s.submitterLamports).padStart(12)} SOL  → ` +
      `${s.deployerSolAddress.slice(0, 8)}…${s.deployerSolAddress.slice(-4)}`
    );
  }

  const totalToSubmitters = shares.reduce((sum, s) => sum + s.submitterLamports, 0);
  console.log(`\n  Total to submitters: ${sol(totalToSubmitters)} SOL`);

  // ── Dry run stops here ──
  if (isDryRun) {
    console.log(`\n  DRY RUN — no payments were sent.`);
    console.log(`  Run without --dry-run to pay out.\n`);
    return;
  }

  // ── Step 5: Send payments ──
  const txSig = `distribution-${Date.now()}`;
  console.log(`\n  Sending payments...\n`);

  const result = await distributeBulkClaim(txSig, distributionLamports, false);

  if (result.success) {
    console.log(`\n${hr()}`);
    console.log(`  DONE`);
    console.log(hr());
    console.log(`  Batch ID:    ${result.batchId}`);
    console.log(`  Tokens:      ${result.tokensCount}`);
    console.log(`  Distributed: ${sol(result.distributedLamports || 0)} SOL`);

    if (result.batchId) {
      const summary = getClaimDistributionSummary(result.batchId);
      if (summary.length > 0) {
        console.log(`\n  Per-token results:\n`);
        for (const s of summary) {
          const status = s.allocation_status === "paid" ? "PAID" : s.allocation_status.toUpperCase();
          const txShort = s.submitter_tx_signature ? s.submitter_tx_signature.slice(0, 12) + "…" : "-";
          console.log(
            `  ${s.ticker.padEnd(12)} ` +
            `${(s.share_percent * 100).toFixed(1).padStart(5)}%  ` +
            `${sol(s.submitter_lamports).padStart(12)} SOL  ` +
            `${status.padEnd(7)}  ${txShort}`
          );
        }
      }
    }
    console.log(`\n${hr()}\n`);
  } else {
    console.error(`\nDistribution failed: ${result.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
