/**
 * Claim & Pay — one-step script to claim pump.fun creator fees and
 * distribute submitter shares.
 *
 * What it does:
 *   1. Claims all accumulated creator fees from pump.fun
 *   2. Checks the wallet balance diff to determine how much was claimed
 *   3. Distributes each submitter's share pro-rata based on trading volume
 *
 * Usage:
 *   npx tsx scripts/claim-and-pay.ts                              # claim + distribute
 *   npx tsx scripts/claim-and-pay.ts --dry-run                    # read-only preview (no claim, no send)
 *   npx tsx scripts/claim-and-pay.ts --skip-claim --amount 1.5    # skip claim, distribute a specific amount
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

function shortDate(iso: string): string {
  const d = new Date(iso + (iso.includes("T") ? "" : "T00:00:00Z"));
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

async function main(): Promise<void> {
  console.log(`\n${hr()}`);
  console.log(`  CLAIM & PAY${isDryRun ? "  [DRY RUN — nothing will be sent]" : ""}`);
  console.log(hr());

  // ── Show wallet balance ──
  const balance = await secureGetBalance("claim-and-pay");
  console.log(`\nMaster wallet balance: ${sol(balance.lamports)} SOL`);

  // ── Determine distribution amount ──
  let distributionLamports = 0;
  let claimSignature: string | null = null;

  if (isDryRun) {
    // Dry run: never touch the chain. Use --amount if given, else show 1 SOL preview.
    const amountStr = getFlag("--amount");
    distributionLamports = amountStr
      ? Math.floor(parseFloat(amountStr) * LAMPORTS_PER_SOL)
      : LAMPORTS_PER_SOL;

    console.log(
      amountStr
        ? `\nDry run with ${sol(distributionLamports)} SOL (from --amount)`
        : `\nDry run — showing preview as if 1 SOL were distributed`
    );

  } else if (skipClaim) {
    // Skip claim: user provides amount manually
    const amountStr = getFlag("--amount");
    if (!amountStr || isNaN(parseFloat(amountStr))) {
      console.log(`\n--skip-claim requires --amount <sol>. Example:`);
      console.log(`  npx tsx scripts/claim-and-pay.ts --skip-claim --amount 1.5\n`);
      process.exit(1);
    }
    distributionLamports = Math.floor(parseFloat(amountStr) * LAMPORTS_PER_SOL);
    console.log(`\nSkipping claim. Distributing ${sol(distributionLamports)} SOL from wallet.`);

  } else {
    // Normal mode: claim fees, then distribute what was received
    console.log(`\nClaiming creator fees from pump.fun...`);

    const connection = getConnection();
    const wallet = secureGetWallet("claim-and-pay");
    const balanceBefore = balance.lamports;

    try {
      claimSignature = await callCollectCreatorFee(connection, wallet);
      console.log(`  Claim tx: ${claimSignature}`);

      // Wait for balance to update
      await new Promise((r) => setTimeout(r, 3000));

      const after = await secureGetBalance("claim-and-pay:after");
      const diff = after.lamports - balanceBefore;

      if (diff > 0) {
        distributionLamports = diff;
        console.log(`  Received:    ${sol(diff)} SOL`);
        console.log(`  New balance: ${sol(after.lamports)} SOL`);
      } else {
        console.log(`  No fees received (balance went from ${sol(balanceBefore)} to ${sol(after.lamports)} SOL).`);
        console.log(`  This likely means there were no unclaimed creator fees on pump.fun.`);
        console.log(`\n  If you know there's SOL to distribute, re-run with:`);
        console.log(`    npx tsx scripts/claim-and-pay.ts --skip-claim --amount <sol>\n`);
        return;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("400") || msg.includes("500") || msg.includes("No fees")) {
        console.log(`  No fees to claim. (pump.fun: ${msg.slice(0, 60)})`);
        console.log(`\n  If you know there's SOL to distribute, re-run with:`);
        console.log(`    npx tsx scripts/claim-and-pay.ts --skip-claim --amount <sol>\n`);
        return;
      }
      console.error(`  Claim failed: ${msg}`);
      process.exit(1);
    }
  }

  // ── Fetch active tokens and volume data ──
  const tokens = getActiveTokensForClaim();
  if (tokens.length === 0) {
    console.log(`\nNo active tokens with mint addresses. Nothing to distribute.`);
    return;
  }

  console.log(`\n${hr("─")}`);
  console.log(`  DISTRIBUTION — ${tokens.length} active token(s)`);
  console.log(hr("─"));

  const volumes = await fetchTokenVolumes(tokens);
  const shares = calculateProRataShares(volumes, tokens, distributionLamports);

  if (shares.length === 0) {
    console.log(`\n  No tokens qualify for distribution (zero trading volume).\n`);
    return;
  }

  // ── Show the breakdown ──
  console.log(`\n  Distributing ${sol(distributionLamports)} SOL:\n`);
  for (const s of shares) {
    const token = tokens.find((t) => t.id === s.tokenId);
    const created = token?.created_at ? shortDate(token.created_at) : "???";
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
    console.log(`\n  This was a dry run. No SOL was sent.`);
    console.log(`  To claim and distribute for real, run without --dry-run.\n`);
    return;
  }

  // ── Execute distribution ──
  const txSig = claimSignature || `manual-${Date.now()}`;
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
