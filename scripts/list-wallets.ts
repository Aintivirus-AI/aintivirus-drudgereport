/**
 * List all dynamic wallets with their decrypted private keys and token info.
 * 
 * Usage:
 *   npx tsx scripts/list-wallets.ts
 * 
 * Requires WALLET_ENCRYPTION_KEY in .env
 */

import dotenv from "dotenv";
dotenv.config();

import { getAllTokens } from "../lib/db";
import { decryptPrivateKey } from "../lib/secrets-provider";

const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;

if (!encryptionKey) {
  console.error("ERROR: WALLET_ENCRYPTION_KEY not set in .env");
  process.exit(1);
}

const tokens = getAllTokens(9999);

const walletsWithKeys = tokens.filter(
  (t) => t.creator_wallet_encrypted_key && t.mint_address
);

console.log(`\nFound ${walletsWithKeys.length} token(s) with ephemeral wallets:\n`);
console.log("=".repeat(120));

for (const token of walletsWithKeys) {
  try {
    const privateKey = decryptPrivateKey(
      token.creator_wallet_encrypted_key!,
      encryptionKey
    );

    console.log(`Ticker:      ${token.ticker}`);
    console.log(`Token Name:  ${token.token_name}`);
    console.log(`Token ID:    ${token.id}`);
    console.log(`Mint:        ${token.mint_address}`);
    console.log(`Pump URL:    ${token.pump_url || `https://pump.fun/coin/${token.mint_address}`}`);
    console.log(`Wallet Addr: ${token.creator_wallet_address}`);
    console.log(`Private Key: ${privateKey}`);
    console.log(`Created:     ${token.created_at}`);
    console.log(`Last Claim:  ${token.last_fee_claim_at || "never"}`);
    console.log("-".repeat(120));
  } catch (error) {
    console.error(`FAILED to decrypt key for ${token.ticker} (#${token.id}): ${error}`);
    console.log("-".repeat(120));
  }
}

// Also show tokens deployed with the master wallet (no ephemeral key)
const masterWalletTokens = tokens.filter(
  (t) => !t.creator_wallet_encrypted_key && t.mint_address
);

if (masterWalletTokens.length > 0) {
  console.log(`\n${"=".repeat(120)}`);
  console.log(`\nAlso found ${masterWalletTokens.length} token(s) deployed with the MASTER wallet:`);
  console.log(`(These don't have separate wallets — fees go directly to your master wallet)\n`);

  for (const token of masterWalletTokens) {
    console.log(`Ticker:      ${token.ticker}`);
    console.log(`Token Name:  ${token.token_name}`);
    console.log(`Mint:        ${token.mint_address}`);
    console.log(`Pump URL:    ${token.pump_url || `https://pump.fun/coin/${token.mint_address}`}`);
    console.log(`Deployer:    ${token.deployer_sol_address}`);
    console.log(`Created:     ${token.created_at}`);
    console.log("-".repeat(120));
  }
}

console.log("\nDone.");
