/**
 * Creator Fee Claimer — collects accumulated pump.fun creator fees
 * from ephemeral deployer wallets and distributes revenue.
 *
 * Each token deployed with an ephemeral wallet has its encrypted private
 * key stored in the database. This module periodically:
 *   1. Funds each ephemeral wallet with a small amount for transaction fees
 *   2. Calls PumpPortal's `collectCreatorFee` to claim accumulated fees
 *   3. Sweeps everything back to the master wallet
 *   4. Triggers the existing revenue distribution (50/50 submitter/creator split)
 *
 * The claim interval is configurable via CREATOR_FEE_CLAIM_INTERVAL_MINUTES
 * (default: 30 minutes).
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";
import bs58 from "bs58";
import {
  getConnection,
  confirmTransactionPolling,
} from "./solana-wallet";
import {
  secureGetWallet,
  checkOperation,
} from "./secure-wallet";
import { logWalletOperation } from "./wallet-audit";
import { decryptPrivateKey } from "./secrets-provider";
import {
  getTokensForFeeClaim,
  updateFeeClaimTimestamp,
} from "./db";
import { recordAndDistributeRevenue } from "./revenue-distributor";
import type { Token } from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * SOL to fund ephemeral wallet for claim + sweep transaction fees.
 * Must cover: token account rent-exempt minimum (2,039,280 lamports)
 * + claim tx fee (~5,000) + sweep tx fee (~5,000) + priority fees buffer.
 * 0.002 SOL was insufficient — the collectCreatorFee instruction creates
 * a token account that requires ~0.00204 SOL in rent.
 */
const CLAIM_FUND_LAMPORTS = Math.floor(0.003 * LAMPORTS_PER_SOL);

/** Minimum net revenue (after fees) to trigger distribution. */
const MIN_CLAIM_REVENUE_LAMPORTS = Math.floor(0.001 * LAMPORTS_PER_SOL);

/** PumpPortal Local Transaction API endpoint. */
const PUMPPORTAL_API_URL = "https://pumpportal.fun/api/trade-local";

/** Maximum tokens to process per claim cycle (prevent runaway). */
const MAX_TOKENS_PER_CYCLE = 50;

/** Delay between individual token claims (ms) to avoid rate-limiting. */
const INTER_CLAIM_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ClaimResult {
  tokenId: number;
  ticker: string;
  success: boolean;
  claimedLamports?: number;
  txSignature?: string;
  error?: string;
}

export interface ClaimCycleResult {
  processed: number;
  claimed: number;
  failed: number;
  totalClaimedLamports: number;
  results: ClaimResult[];
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Claim creator fees from all eligible tokens.
 * Called periodically by the scheduler (every 30 minutes).
 *
 * Two phases:
 *   1. Master wallet claim — one call collects fees for ALL old tokens
 *      deployed directly with the master wallet. Helius webhook handles
 *      distribution when the SOL arrives.
 *   2. Ephemeral wallet claims — per-token claim + sweep + distribute
 *      for tokens deployed with ephemeral deployer wallets.
 */
export async function claimAllCreatorFees(): Promise<ClaimCycleResult> {
  const connection = getConnection();
  const masterWallet = secureGetWallet("fee-claimer");

  const results: ClaimResult[] = [];
  let claimed = 0;
  let failed = 0;
  let totalClaimedLamports = 0;

  // ── Phase 1: Claim master wallet fees (covers all old tokens) ──────────
  try {
    await claimMasterWalletFees(connection, masterWallet);
  } catch (error) {
    console.warn(
      "[FeeClaimer] Master wallet claim failed (non-fatal):",
      error instanceof Error ? error.message : error
    );
  }

  // ── Phase 2: Claim ephemeral wallet fees (per-token) ───────────────────
  const encryptionKey = process.env.WALLET_ENCRYPTION_KEY;
  if (!encryptionKey) {
    console.log("[FeeClaimer] WALLET_ENCRYPTION_KEY not set, skipping ephemeral fee claims");
    return { processed: 0, claimed, failed, totalClaimedLamports, results };
  }

  const claimIntervalMinutes = parseInt(
    process.env.CREATOR_FEE_CLAIM_INTERVAL_MINUTES || "30",
    10
  );

  const tokens = getTokensForFeeClaim(claimIntervalMinutes);
  if (tokens.length === 0) {
    console.log("[FeeClaimer] No ephemeral tokens due for fee claiming");
    return { processed: 0, claimed, failed, totalClaimedLamports, results };
  }

  const tokensToProcess = tokens.slice(0, MAX_TOKENS_PER_CYCLE);
  console.log(
    `[FeeClaimer] Processing ${tokensToProcess.length} ephemeral token(s) for creator fee claims` +
    (tokens.length > MAX_TOKENS_PER_CYCLE
      ? ` (${tokens.length - MAX_TOKENS_PER_CYCLE} deferred to next cycle)`
      : "")
  );

  for (const token of tokensToProcess) {
    try {
      // Decrypt the ephemeral wallet key
      const base58Key = decryptPrivateKey(
        token.creator_wallet_encrypted_key!,
        encryptionKey
      );
      const ephemeralKeypair = Keypair.fromSecretKey(bs58.decode(base58Key));

      // Verify the public key matches what we stored
      if (ephemeralKeypair.publicKey.toBase58() !== token.creator_wallet_address) {
        throw new Error(
          `Key mismatch: decrypted key yields ${ephemeralKeypair.publicKey.toBase58()}, ` +
          `expected ${token.creator_wallet_address}`
        );
      }

      const result = await claimAndSweep(
        connection,
        masterWallet,
        ephemeralKeypair,
        token
      );

      results.push(result);
      if (result.success && result.claimedLamports && result.claimedLamports > 0) {
        claimed++;
        totalClaimedLamports += result.claimedLamports;
      } else if (!result.success) {
        failed++;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`[FeeClaimer] Error processing ${token.ticker} (#${token.id}):`, errorMessage);
      results.push({
        tokenId: token.id,
        ticker: token.ticker,
        success: false,
        error: errorMessage,
      });
      failed++;
    }

    // Delay between tokens to avoid rate-limiting
    if (tokensToProcess.indexOf(token) < tokensToProcess.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, INTER_CLAIM_DELAY_MS));
    }
  }

  console.log(
    `[FeeClaimer] Cycle complete: ${claimed} claimed, ${failed} failed, ` +
    `${totalClaimedLamports / LAMPORTS_PER_SOL} SOL total revenue`
  );

  return {
    processed: tokensToProcess.length,
    claimed,
    failed,
    totalClaimedLamports,
    results,
  };
}

// ---------------------------------------------------------------------------
// Master wallet fee claiming
// ---------------------------------------------------------------------------

/**
 * Claim all accumulated creator fees for the master wallet.
 *
 * pump.fun claims "all at once" per wallet — one call covers every token
 * that was deployed with this wallet. The SOL arrives directly at the master
 * wallet, where the Helius webhook detects it and handles distribution
 * (match by mint → per-token revenue, or fallback to bulk pro-rata).
 */
async function claimMasterWalletFees(
  connection: Connection,
  masterWallet: Keypair
): Promise<void> {
  console.log("[FeeClaimer] Claiming master wallet creator fees...");

  try {
    const signature = await callCollectCreatorFee(connection, masterWallet);
    console.log(`[FeeClaimer] Master wallet claim tx: ${signature}`);

    logWalletOperation({
      operation: "claim_creator_fee",
      caller: "fee-claimer:master",
      success: true,
      txSignature: signature,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    // A 400/500 from PumpPortal likely means "no fees to claim" — not a real error
    if (msg.includes("400") || msg.includes("500") || msg.includes("No fees")) {
      console.log("[FeeClaimer] Master wallet: no fees to claim (or API unavailable)");
    } else {
      logWalletOperation({
        operation: "claim_creator_fee",
        caller: "fee-claimer:master",
        success: false,
        errorMessage: msg,
      });
      throw error;
    }
  }
}

// ---------------------------------------------------------------------------
// Per-token claim and sweep
// ---------------------------------------------------------------------------

/**
 * Claim creator fees for a single token and sweep to master wallet.
 */
async function claimAndSweep(
  connection: Connection,
  masterWallet: Keypair,
  ephemeralKeypair: Keypair,
  token: Token
): Promise<ClaimResult> {
  const tokenLabel = `${token.ticker} (#${token.id})`;
  console.log(`[FeeClaimer] Claiming fees for ${tokenLabel}...`);

  // Pre-flight guardrail check
  const guardrailCheck = checkOperation(CLAIM_FUND_LAMPORTS, "fee-claimer");
  if (!guardrailCheck.allowed) {
    return {
      tokenId: token.id,
      ticker: token.ticker,
      success: false,
      error: `Guardrail blocked: ${guardrailCheck.reason}`,
    };
  }

  // Step 1: Fund ephemeral wallet for transaction fees
  try {
    await fundForClaim(connection, masterWallet, ephemeralKeypair.publicKey);
  } catch (fundError) {
    return {
      tokenId: token.id,
      ticker: token.ticker,
      success: false,
      error: `Failed to fund ephemeral wallet: ${fundError instanceof Error ? fundError.message : fundError}`,
    };
  }

  // Step 2: Call collectCreatorFee via PumpPortal
  let claimSignature: string | undefined;
  try {
    claimSignature = await callCollectCreatorFee(connection, ephemeralKeypair);
    console.log(`[FeeClaimer] ${tokenLabel}: claim tx ${claimSignature}`);
  } catch (claimError) {
    const errMsg = claimError instanceof Error ? claimError.message : String(claimError);

    // Sweep the funding SOL back regardless
    console.warn(
      `[FeeClaimer] ${tokenLabel}: claim failed, sweeping funding back:`,
      errMsg
    );
    await safeSweep(connection, ephemeralKeypair, masterWallet.publicKey);

    // Distinguish between "PumpPortal says no fees" vs infrastructure errors.
    // 400/500 from PumpPortal → no fees to claim → update timestamp to avoid hammering.
    // Simulation failures, timeouts, etc. → our problem → DON'T update timestamp so
    // the token gets retried on the next cycle after we fix the issue.
    const isNoFeesResponse = errMsg.includes("400") || errMsg.includes("500") || errMsg.includes("No fees");

    if (isNoFeesResponse) {
      updateFeeClaimTimestamp(token.id);
      return {
        tokenId: token.id,
        ticker: token.ticker,
        success: true, // Not a hard failure — just no fees available
        claimedLamports: 0,
      };
    }

    // Infrastructure error — don't update timestamp, report as failure
    return {
      tokenId: token.id,
      ticker: token.ticker,
      success: false,
      error: errMsg,
    };
  }

  // Step 3: Check balance and calculate net revenue
  const balanceAfterClaim = await connection.getBalance(ephemeralKeypair.publicKey);
  const netRevenue = balanceAfterClaim - CLAIM_FUND_LAMPORTS;

  // Step 4: Sweep all SOL back to master wallet
  await safeSweep(connection, ephemeralKeypair, masterWallet.publicKey);

  // Step 5: Distribute revenue if above minimum
  if (netRevenue > MIN_CLAIM_REVENUE_LAMPORTS) {
    console.log(
      `[FeeClaimer] ${tokenLabel}: claimed ${netRevenue / LAMPORTS_PER_SOL} SOL in creator fees`
    );

    try {
      const distResult = await recordAndDistributeRevenue(token.id, netRevenue);
      if (distResult.success) {
        console.log(
          `[FeeClaimer] ${tokenLabel}: revenue distributed (submitter tx: ${distResult.submitterTxSignature})`
        );
      } else {
        console.warn(
          `[FeeClaimer] ${tokenLabel}: revenue distribution failed: ${distResult.error}`
        );
      }
    } catch (distError) {
      console.error(`[FeeClaimer] ${tokenLabel}: revenue distribution error:`, distError);
    }

    // Audit log
    logWalletOperation({
      operation: "claim_creator_fee",
      amountLamports: netRevenue,
      caller: "fee-claimer",
      success: true,
      txSignature: claimSignature,
      metadata: { tokenId: token.id, ticker: token.ticker },
    });
  } else {
    console.log(
      `[FeeClaimer] ${tokenLabel}: no significant fees ` +
      `(net ${netRevenue / LAMPORTS_PER_SOL} SOL, below ${MIN_CLAIM_REVENUE_LAMPORTS / LAMPORTS_PER_SOL} SOL minimum)`
    );
  }

  // Step 6: Update claim timestamp
  updateFeeClaimTimestamp(token.id);

  return {
    tokenId: token.id,
    ticker: token.ticker,
    success: true,
    claimedLamports: Math.max(0, netRevenue),
    txSignature: claimSignature,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fund an ephemeral wallet with a small amount for claim + sweep transaction fees.
 */
async function fundForClaim(
  connection: Connection,
  masterWallet: Keypair,
  ephemeralPublicKey: PublicKey
): Promise<string> {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: masterWallet.publicKey,
      toPubkey: ephemeralPublicKey,
      lamports: CLAIM_FUND_LAMPORTS,
    })
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = masterWallet.publicKey;
  tx.sign(masterWallet);

  const signature = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await confirmTransactionPolling(
    connection,
    signature,
    blockhash,
    lastValidBlockHeight,
    "confirmed"
  );

  return signature;
}

/**
 * Call PumpPortal's collectCreatorFee Local Transaction API.
 * Returns the confirmed transaction signature.
 */
async function callCollectCreatorFee(
  connection: Connection,
  ephemeralKeypair: Keypair
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let txData: ArrayBuffer;
  try {
    const response = await fetch(PUMPPORTAL_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: ephemeralKeypair.publicKey.toBase58(),
        action: "collectCreatorFee",
        priorityFee: 0.000001,
        pool: "pump",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `PumpPortal collectCreatorFee error: ${response.status} - ${errorText}`
      );
    }

    txData = await response.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
  tx.sign([ephemeralKeypair]);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await confirmTransactionPolling(
    connection,
    signature,
    blockhash,
    lastValidBlockHeight,
    "confirmed"
  );

  return signature;
}

/**
 * Sweep all SOL from an ephemeral wallet back to master.
 * Best-effort — logs warnings but never throws.
 */
async function safeSweep(
  connection: Connection,
  ephemeralKeypair: Keypair,
  masterPublicKey: PublicKey
): Promise<void> {
  try {
    const balance = await connection.getBalance(ephemeralKeypair.publicKey);
    const fee = 5_000; // ~0.000005 SOL standard transaction fee
    const sweepAmount = balance - fee;

    if (sweepAmount <= 0) {
      return;
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: ephemeralKeypair.publicKey,
        toPubkey: masterPublicKey,
        lamports: sweepAmount,
      })
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = ephemeralKeypair.publicKey;
    tx.sign(ephemeralKeypair);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    await confirmTransactionPolling(
      connection,
      signature,
      blockhash,
      lastValidBlockHeight,
      "confirmed"
    );

    console.log(
      `[FeeClaimer] Swept ${(sweepAmount / LAMPORTS_PER_SOL).toFixed(6)} SOL back to master (tx: ${signature})`
    );
  } catch (error) {
    console.warn(`[FeeClaimer] Sweep failed:`, error);
  }
}
