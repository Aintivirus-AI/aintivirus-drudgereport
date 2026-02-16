/**
 * Drain all pool wallets — sweep every last lamport back to the master wallet.
 *
 * Recovers SOL from ALL pool wallets regardless of status (ready, reserved, failed).
 * Run this once to reclaim all pool funds now that we deploy from the master wallet.
 *
 * Usage:
 *   npx tsx scripts/drain-pool.ts              # sweep everything
 *   npx tsx scripts/drain-pool.ts --dry-run    # preview without sending transactions
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { sweepPoolWallets, getPoolStats } from "../lib/pool-manager";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  // Show current pool state
  const stats = getPoolStats();
  console.log("\n=== Pool Status ===");
  console.log(`  Ready:    ${stats.ready}`);
  console.log(`  Reserved: ${stats.reserved}`);
  console.log(`  Used:     ${stats.used}`);
  console.log(`  Failed:   ${stats.failed}`);
  console.log(`  Total:    ${stats.total}`);

  const recoverable = stats.ready + stats.reserved + stats.failed;
  if (recoverable === 0) {
    console.log("\nNo pool wallets to drain. All clear.");
    process.exit(0);
  }

  console.log(`\nDraining ${recoverable} wallet(s)${dryRun ? " [DRY RUN]" : ""}...\n`);

  // Sweep all recoverable statuses
  const result = await sweepPoolWallets({
    dryRun,
    statusFilter: ["ready", "reserved", "failed"],
  });

  console.log("\n=== Results ===");
  console.log(`  Swept:     ${result.swept}`);
  console.log(`  Failed:    ${result.failed}`);
  console.log(`  Recovered: ${result.totalSolRecovered.toFixed(6)} SOL`);

  if (result.errors.length > 0) {
    console.log(`\n  Errors:`);
    for (const err of result.errors) {
      console.log(`    - ${err}`);
    }
  }

  if (!dryRun) {
    const statsAfter = getPoolStats();
    console.log("\n=== Pool After ===");
    console.log(`  Ready:    ${statsAfter.ready}`);
    console.log(`  Reserved: ${statsAfter.reserved}`);
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
