/**
 * Sweep stranded SOL from pool wallets back to the master wallet.
 *
 * Finds all pool wallets in "ready", "reserved", or "failed" status that
 * still hold SOL on-chain, sweeps the remaining balance back to master,
 * and marks them as "used" so they're not reused.
 *
 * Usage:
 *   npx tsx scripts/sweep-pool.ts              # sweep all recoverable wallets
 *   npx tsx scripts/sweep-pool.ts --dry-run    # preview without executing
 *   npx tsx scripts/sweep-pool.ts --failed     # sweep only "failed" wallets
 *
 * Requires WALLET_ENCRYPTION_KEY and MASTER_WALLET_PRIVATE_KEY in .env
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { sweepPoolWallets, getPoolStats } from "../lib/pool-manager";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const failedOnly = args.includes("--failed");

  // Show current pool state
  const stats = getPoolStats();
  console.log("\n=== Deployer Wallet Pool ===");
  console.log(`  Ready:    ${stats.ready}`);
  console.log(`  Reserved: ${stats.reserved}`);
  console.log(`  Used:     ${stats.used}`);
  console.log(`  Failed:   ${stats.failed}`);
  console.log(`  Total:    ${stats.total}`);
  console.log("");

  const statusFilter = failedOnly
    ? (["failed"] as Array<"failed">)
    : undefined;

  // Sweep wallets
  const result = await sweepPoolWallets({ dryRun, statusFilter });

  // Show results
  console.log("\n=== Results ===");
  console.log(`  Swept:         ${result.swept}`);
  console.log(`  Failed:        ${result.failed}`);
  console.log(`  SOL recovered: ${result.totalSolRecovered.toFixed(6)}`);

  if (result.errors.length > 0) {
    console.log(`\n  Errors:`);
    for (const err of result.errors) {
      console.log(`    - ${err}`);
    }
  }

  // Show updated pool state
  if (!dryRun) {
    const statsAfter = getPoolStats();
    console.log("\n=== Pool After ===");
    console.log(`  Ready:    ${statsAfter.ready}`);
    console.log(`  Failed:   ${statsAfter.failed}`);
    console.log(`  Total:    ${statsAfter.total}`);
  }

  console.log("");
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
