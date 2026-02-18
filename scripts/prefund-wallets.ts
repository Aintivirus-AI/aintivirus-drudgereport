/**
 * Pre-fund deployer wallets into the pool.
 *
 * Generates N fresh wallets, funds each from the master wallet,
 * encrypts the private keys, and stores them in the deployer_pool table.
 *
 * Usage:
 *   npx tsx scripts/prefund-wallets.ts              # fund 10 wallets (default)
 *   npx tsx scripts/prefund-wallets.ts --count 20   # fund 20 wallets
 *   npx tsx scripts/prefund-wallets.ts --dry-run    # preview without spending SOL
 *
 * Requires WALLET_ENCRYPTION_KEY and MASTER_WALLET_PRIVATE_KEY in .env
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { fundPoolWallets, getPoolStats } from "../lib/pool-manager";

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  let count = 10; // default
  const countIdx = args.indexOf("--count");
  if (countIdx !== -1 && args[countIdx + 1]) {
    count = parseInt(args[countIdx + 1], 10);
    if (isNaN(count) || count < 1 || count > 100) {
      console.error("ERROR: --count must be between 1 and 100");
      process.exit(1);
    }
  }

  // Show current pool state
  const statsBefore = getPoolStats();
  console.log("\n=== Deployer Wallet Pool ===");
  console.log(`  Ready:    ${statsBefore.ready}`);
  console.log(`  Reserved: ${statsBefore.reserved}`);
  console.log(`  Used:     ${statsBefore.used}`);
  console.log(`  Failed:   ${statsBefore.failed}`);
  console.log(`  Total:    ${statsBefore.total}`);
  console.log("");

  // Fund wallets
  const result = await fundPoolWallets(count, { dryRun });

  // Show results
  console.log("\n=== Results ===");
  console.log(`  Funded:    ${result.funded}`);
  console.log(`  Failed:    ${result.failed}`);
  console.log(`  SOL spent: ${result.totalSolSpent.toFixed(4)}`);

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
    console.log(`  Total:    ${statsAfter.total}`);
  }

  console.log("");
  process.exit(result.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
