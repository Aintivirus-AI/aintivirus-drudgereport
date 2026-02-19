/**
 * Claim & Pay — one-step script to claim pump.fun creator fees and
 * distribute submitter shares.
 *
 * What it does:
 *   1. Checks the master wallet balance
 *   2. Claims all accumulated creator fees from pump.fun
 *   3. Checks the balance again to determine how much was claimed
 *   4. Distributes each submitter's share pro-rata based on trading volume
 *
 * Usage:
 *   npx tsx scripts/claim-and-pay.ts              # claim + distribute
 *   npx tsx scripts/claim-and-pay.ts --dry-run    # claim only, show what WOULD be distributed
 *   npx tsx scripts/claim-and-pay.ts --skip-claim # skip the claim step, distribute from existing balance
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
} from "../lib/db";

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const skipClaim = args.includes("--skip-claim");

function sol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(6);
}

function line(char = "═", len = 60): string {
  return char.repeat(len);
}

async function main(): Promise<void> {
  console.log(`\n${line()}`);
  console.log(`  CLAIM & PAY${isDryRun ? "  [DRY RUN]" : ""}`);
  console.log(line());

  const connection = getConnection();
  const wallet = secureGetWallet("claim-and-pay");

  // Step 1: Check balance before
  const before = await secureGetBalance("claim-and-pay:before");
  console.log(`\nMaster wallet balance: ${sol(before.lamports)} SOL`);

  // Step 2: Claim fees from pump.fun
  let claimSignature: string | null = null;
  let claimedLamports = 0;

  if (skipClaim) {
    console.log(`\n[Skipping claim — using existing balance]`);
  } else {
    console.log(`\nClaiming creator fees from pump.fun...`);
    try {
      claimSignature = await callCollectCreatorFee(connection, wallet);
      console.log(`Claim tx: ${claimSignature}`);

      // Brief pause for balance to settle
      await new Promise((r) => setTimeout(r, 3000));

      const after = await secureGetBalance("claim-and-pay:after");
      claimedLamports = after.lamports - before.lamports;

      if (claimedLamports > 0) {
        console.log(`Claimed: ${sol(claimedLamports)} SOL`);
        console.log(`New balance: ${sol(after.lamports)} SOL`);
      } else {
        console.log(`No net SOL received (balance unchanged or decreased from tx fees).`);
        console.log(`New balance: ${sol(after.lamports)} SOL`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("400") || msg.includes("500") || msg.includes("No fees")) {
        console.log(`No fees to claim (pump.fun returned: ${msg.slice(0, 80)})`);
      } else {
        console.error(`Claim failed: ${msg}`);
        process.exit(1);
      }
    }
  }

  // Step 3: Show distribution preview
  const tokens = getActiveTokensForClaim();
  if (tokens.length === 0) {
    console.log(`\nNo active tokens with mint addresses. Nothing to distribute.`);
    return;
  }

  console.log(`\n${line("─")}`);
  console.log(`  DISTRIBUTION — ${tokens.length} active token(s)`);
  console.log(line("─"));

  const volumes = await fetchTokenVolumes(tokens);

  // Use claimed amount if we claimed, otherwise ask user or show preview
  let distributionLamports = claimedLamports;

  if (distributionLamports <= 0 && !skipClaim) {
    console.log(`\nNothing to distribute (0 SOL claimed).`);
    return;
  }

  if (skipClaim) {
    // When skipping claim, use an --amount flag or show a preview with 1 SOL
    const amountArg = args.find((_, i) => args[i - 1] === "--amount");
    if (amountArg) {
      distributionLamports = Math.floor(parseFloat(amountArg) * LAMPORTS_PER_SOL);
    } else {
      console.log(`\nNo --amount specified with --skip-claim. Showing preview with 1 SOL.\n`);
      distributionLamports = LAMPORTS_PER_SOL;
      // Force dry run mode for preview
      showPreview(volumes, tokens, distributionLamports);
      console.log(`\nTo distribute, re-run with: --skip-claim --amount <sol>`);
      return;
    }
  }

  if (isDryRun) {
    showPreview(volumes, tokens, distributionLamports);
    console.log(`\nDry run complete. No SOL was sent.`);
    console.log(`Re-run without --dry-run to actually distribute.`);
    return;
  }

  // Step 4: Distribute
  const txSig = claimSignature || `manual-${Date.now()}`;
  console.log(`\nDistributing ${sol(distributionLamports)} SOL across ${tokens.length} token(s)...\n`);

  const result = await distributeBulkClaim(txSig, distributionLamports, false);

  if (result.success) {
    console.log(`\n${line()}`);
    console.log(`  DISTRIBUTION COMPLETE`);
    console.log(line());
    console.log(`  Batch ID:     ${result.batchId}`);
    console.log(`  Tokens:       ${result.tokensCount}`);
    console.log(`  Distributed:  ${sol(result.distributedLamports || 0)} SOL`);

    if (result.batchId) {
      const summary = getClaimDistributionSummary(result.batchId);
      if (summary.length > 0) {
        console.log(`\n  Per-token breakdown:\n`);
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
    console.log(`\n${line()}\n`);
  } else {
    console.error(`\nDistribution failed: ${result.error}`);
    process.exit(1);
  }
}

function showPreview(
  volumes: Awaited<ReturnType<typeof fetchTokenVolumes>>,
  tokens: ReturnType<typeof getActiveTokensForClaim>,
  totalLamports: number
): void {
  const shares = calculateProRataShares(volumes, tokens, totalLamports);

  if (shares.length === 0) {
    console.log(`  No tokens qualify for distribution (zero volume).`);
    return;
  }

  console.log(`\n  Preview: distributing ${sol(totalLamports)} SOL\n`);
  for (const s of shares) {
    const token = tokens.find((t) => t.id === s.tokenId);
    console.log(
      `  ${(token?.ticker || `#${s.tokenId}`).padEnd(12)} ` +
      `${(s.sharePercent * 100).toFixed(1).padStart(5)}%  ` +
      `${sol(s.submitterLamports).padStart(12)} SOL  → ` +
      `${s.deployerSolAddress.slice(0, 8)}…${s.deployerSolAddress.slice(-4)}`
    );
  }

  const totalSubmitter = shares.reduce((sum, s) => sum + s.submitterLamports, 0);
  console.log(`\n  Total to submitters: ${sol(totalSubmitter)} SOL`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
