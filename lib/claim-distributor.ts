/**
 * Claim Distributor — fair pro-rata distribution of bulk pump.fun claims.
 *
 * When pump.fun's "Claim" sends a single bulk SOL transfer to the master
 * wallet (with no per-token mint data), this module distributes the SOL
 * fairly across all active tokens based on their relative trading volume.
 *
 * Flow:
 * 1. Fetch trading volume for every active token via pump.fun API
 * 2. Compute each token's volume delta since the last claim snapshot
 * 3. Split the bulk SOL proportionally (volume-weighted pro-rata)
 * 4. Apply the existing submitter/creator share split (default 50/50)
 * 5. Send each submitter's share via secureSendSol
 * 6. Record everything in claim_batches + claim_allocations for audit
 */

import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { isValidSolanaAddress } from "./solana-wallet";
import { secureSendSol } from "./secure-wallet";
import {
  getActiveTokensForClaim,
  getClaimBatchByTxSignature,
  createClaimBatch,
  updateClaimBatchStatus,
  createClaimAllocation,
  updateClaimAllocationStatus,
  getClaimAllocationsByBatch,
  getLastVolumeSnapshot,
  saveVolumeSnapshot,
  getTokenById,
} from "./db";
import type { Token, ClaimBatch } from "./types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum total claim to process (avoid processing dust). */
const MIN_CLAIM_LAMPORTS = 10_000; // 0.00001 SOL

/** Minimum per-token distribution (skip if below this). */
const MIN_DISTRIBUTION_LAMPORTS = Math.floor(0.001 * LAMPORTS_PER_SOL);

/** Submitter share percentage (mirrors revenue-distributor logic). */
function getSubmitterSharePercent(): number {
  const raw = parseFloat(process.env.REVENUE_SUBMITTER_SHARE || "0.5");
  return isNaN(raw) ? 0.5 : Math.max(0, Math.min(1, raw));
}

/** Pump.fun API URLs — try v3 first, fall back to v1. */
const PUMP_API_V3 = "https://frontend-api-v3.pump.fun/coins";
const PUMP_API_V1 = "https://frontend-api.pump.fun/coins";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenVolume {
  tokenId: number;
  mintAddress: string;
  currentVolume: number;      // Cumulative volume from pump.fun API
  previousVolume: number;     // Last snapshot (0 if first claim)
  volumeDelta: number;        // currentVolume - previousVolume
}

export interface ProRataShare {
  tokenId: number;
  mintAddress: string;
  deployerSolAddress: string;
  volumeDelta: number;
  sharePercent: number;        // 0–1 (proportion of total volume delta)
  totalAmountLamports: number; // This token's share of the bulk claim
  submitterLamports: number;   // After applying the submitter share %
}

export interface BulkClaimResult {
  success: boolean;
  batchId?: number;
  tokensCount?: number;
  distributedLamports?: number;
  error?: string;
  allocations?: ProRataShare[];
}

// ---------------------------------------------------------------------------
// Pump.fun API — fetch volume per token
// ---------------------------------------------------------------------------

interface PumpCoinData {
  mint?: string;
  total_supply?: number;
  usd_market_cap?: number;
  price?: number;
  volume_24h?: number;
  /** Total cumulative trading volume in USD. May be named differently across API versions. */
  total_volume?: number;
  cumulative_volume?: number;
  /** Some API versions use this. */
  volume?: number;
}

/**
 * Fetch coin data from pump.fun API for a single mint.
 * Tries v3 first, falls back to v1.
 */
async function fetchPumpCoinData(mintAddress: string): Promise<PumpCoinData | null> {
  for (const baseUrl of [PUMP_API_V3, PUMP_API_V1]) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(`${baseUrl}/${mintAddress}`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) continue;

      const data = await response.json();
      return data as PumpCoinData;
    } catch {
      // Try next URL
    }
  }
  return null;
}

/**
 * Extract the best available cumulative volume figure from pump.fun coin data.
 * Different API versions may use different field names.
 */
function extractVolume(data: PumpCoinData): number {
  // Try various field names for cumulative/total volume
  const vol =
    data.total_volume ??
    data.cumulative_volume ??
    data.volume ??
    data.volume_24h ??
    0;
  return typeof vol === "number" && !isNaN(vol) ? vol : 0;
}

/**
 * Fetch trading volumes for all active tokens.
 * Returns an array of TokenVolume objects with delta calculation.
 */
export async function fetchTokenVolumes(tokens: Token[]): Promise<TokenVolume[]> {
  const volumes: TokenVolume[] = [];

  for (const token of tokens) {
    if (!token.mint_address) continue;

    const data = await fetchPumpCoinData(token.mint_address);
    const currentVolume = data ? extractVolume(data) : 0;

    // Get previous snapshot for delta calculation
    const lastSnapshot = getLastVolumeSnapshot(token.id);
    const previousVolume = lastSnapshot?.cumulative_volume ?? 0;
    const volumeDelta = Math.max(0, currentVolume - previousVolume);

    volumes.push({
      tokenId: token.id,
      mintAddress: token.mint_address,
      currentVolume,
      previousVolume,
      volumeDelta,
    });

    // Small delay to avoid rate-limiting the pump.fun API
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return volumes;
}

// ---------------------------------------------------------------------------
// Pro-rata share calculation
// ---------------------------------------------------------------------------

/**
 * Calculate each token's proportional share of a bulk claim.
 */
export function calculateProRataShares(
  volumes: TokenVolume[],
  tokens: Token[],
  totalClaimLamports: number
): ProRataShare[] {
  const submitterSharePercent = getSubmitterSharePercent();

  // Total volume delta across all tokens
  const totalDelta = volumes.reduce((sum, v) => sum + v.volumeDelta, 0);

  // If no volume delta at all, fall back to equal distribution
  const useEqualSplit = totalDelta === 0;
  const activeCount = volumes.filter((v) => v.volumeDelta > 0 || useEqualSplit).length;

  if (activeCount === 0) return [];

  const tokenMap = new Map(tokens.map((t) => [t.id, t]));
  const shares: ProRataShare[] = [];

  for (const vol of volumes) {
    const token = tokenMap.get(vol.tokenId);
    if (!token) continue;

    // Skip tokens with no volume delta (unless doing equal split)
    if (!useEqualSplit && vol.volumeDelta === 0) continue;

    const sharePercent = useEqualSplit
      ? 1 / activeCount
      : vol.volumeDelta / totalDelta;

    const totalAmountLamports = Math.floor(totalClaimLamports * sharePercent);
    const submitterLamports = Math.floor(totalAmountLamports * submitterSharePercent);

    shares.push({
      tokenId: vol.tokenId,
      mintAddress: vol.mintAddress,
      deployerSolAddress: token.deployer_sol_address,
      volumeDelta: vol.volumeDelta,
      sharePercent,
      totalAmountLamports,
      submitterLamports,
    });
  }

  return shares;
}

// ---------------------------------------------------------------------------
// Distribution execution
// ---------------------------------------------------------------------------

/**
 * Distribute a bulk pump.fun claim across all active tokens pro-rata.
 *
 * @param txSignature - The Solana transaction signature of the claim (for idempotency)
 * @param totalLamports - Total SOL received in lamports
 * @param dryRun - If true, calculate shares but don't send SOL or write to DB
 */
export async function distributeBulkClaim(
  txSignature: string,
  totalLamports: number,
  dryRun: boolean = false
): Promise<BulkClaimResult> {
  console.log(
    `[ClaimDistributor] Processing bulk claim: ${totalLamports / LAMPORTS_PER_SOL} SOL ` +
    `(tx: ${txSignature.slice(0, 12)}…)${dryRun ? " [DRY RUN]" : ""}`
  );

  // Guard: minimum amount
  if (totalLamports < MIN_CLAIM_LAMPORTS) {
    return { success: false, error: `Claim too small: ${totalLamports} lamports` };
  }

  // Idempotency: skip if already processed
  if (!dryRun) {
    const existing = getClaimBatchByTxSignature(txSignature);
    if (existing) {
      console.log(`[ClaimDistributor] Batch already exists for tx ${txSignature.slice(0, 12)}… (status: ${existing.status})`);
      return { success: false, error: `Already processed (batch #${existing.id})` };
    }
  }

  // Fetch all active tokens
  const tokens = getActiveTokensForClaim();
  if (tokens.length === 0) {
    return { success: false, error: "No active tokens with mint addresses" };
  }

  console.log(`[ClaimDistributor] Found ${tokens.length} active token(s)`);

  // Fetch trading volumes from pump.fun API
  const volumes = await fetchTokenVolumes(tokens);

  // Calculate pro-rata shares
  const shares = calculateProRataShares(volumes, tokens, totalLamports);
  if (shares.length === 0) {
    return { success: false, error: "No tokens qualify for distribution (zero volume)" };
  }

  console.log(`[ClaimDistributor] Distribution plan:`);
  for (const share of shares) {
    const token = tokens.find((t) => t.id === share.tokenId);
    console.log(
      `  ${token?.ticker || `#${share.tokenId}`}: ` +
      `${(share.sharePercent * 100).toFixed(2)}% → ` +
      `${share.totalAmountLamports / LAMPORTS_PER_SOL} SOL total, ` +
      `${share.submitterLamports / LAMPORTS_PER_SOL} SOL to submitter`
    );
  }

  // Dry run stops here
  if (dryRun) {
    return {
      success: true,
      tokensCount: shares.length,
      distributedLamports: shares.reduce((s, a) => s + a.submitterLamports, 0),
      allocations: shares,
    };
  }

  // Create the claim batch record
  const batch = createClaimBatch(txSignature, totalLamports, shares.length);
  console.log(`[ClaimDistributor] Created batch #${batch.id}`);
  updateClaimBatchStatus(batch.id, "distributing");

  // Create allocation records and distribute
  let distributedLamports = 0;

  for (const share of shares) {
    // Save volume snapshot for this token (for delta calculation next time)
    const vol = volumes.find((v) => v.tokenId === share.tokenId);
    if (vol) {
      saveVolumeSnapshot(share.tokenId, vol.currentVolume, "pump_api");
    }

    // Create allocation record
    const allocation = createClaimAllocation(
      batch.id,
      share.tokenId,
      vol?.currentVolume ?? 0,
      share.sharePercent,
      share.totalAmountLamports,
      share.submitterLamports
    );

    // Skip if submitter share is below dust threshold
    if (share.submitterLamports < MIN_DISTRIBUTION_LAMPORTS) {
      console.log(
        `[ClaimDistributor] Skipping ${share.mintAddress.slice(0, 8)}… ` +
        `(${share.submitterLamports / LAMPORTS_PER_SOL} SOL below minimum)`
      );
      updateClaimAllocationStatus(allocation.id, "skipped");
      continue;
    }

    // Validate recipient address
    if (!isValidSolanaAddress(share.deployerSolAddress)) {
      console.error(`[ClaimDistributor] Invalid address for token #${share.tokenId}: ${share.deployerSolAddress}`);
      updateClaimAllocationStatus(allocation.id, "failed");
      continue;
    }

    // Send SOL to submitter
    try {
      const result = await secureSendSol(
        share.deployerSolAddress,
        share.submitterLamports,
        "claim-distributor"
      );

      if (result.success) {
        updateClaimAllocationStatus(allocation.id, "paid", result.signature);
        distributedLamports += share.submitterLamports;
        console.log(
          `[ClaimDistributor] Paid ${share.submitterLamports / LAMPORTS_PER_SOL} SOL ` +
          `to ${share.deployerSolAddress.slice(0, 8)}… (tx: ${result.signature?.slice(0, 12)}…)`
        );
      } else {
        console.error(`[ClaimDistributor] Payment failed for token #${share.tokenId}: ${result.error}`);
        updateClaimAllocationStatus(allocation.id, "failed");
      }
    } catch (err) {
      console.error(`[ClaimDistributor] Error paying token #${share.tokenId}:`, err);
      updateClaimAllocationStatus(allocation.id, "failed");
    }

    // Small delay between transfers
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Finalize batch
  const allAllocations = getClaimAllocationsByBatch(batch.id);
  const anyFailed = allAllocations.some((a) => a.status === "failed");
  const finalStatus = anyFailed ? "failed" : "completed";

  updateClaimBatchStatus(batch.id, finalStatus, distributedLamports);

  console.log(
    `[ClaimDistributor] Batch #${batch.id} ${finalStatus}: ` +
    `distributed ${distributedLamports / LAMPORTS_PER_SOL} SOL across ${shares.length} token(s)`
  );

  return {
    success: true,
    batchId: batch.id,
    tokensCount: shares.length,
    distributedLamports,
    allocations: shares,
  };
}

// ---------------------------------------------------------------------------
// Re-process a pending/failed batch
// ---------------------------------------------------------------------------

/**
 * Retry failed allocations within an existing batch.
 */
export async function retryFailedAllocations(batchId: number): Promise<{
  retried: number;
  succeeded: number;
  failed: number;
}> {
  const allocations = getClaimAllocationsByBatch(batchId);
  const failedAllocations = allocations.filter((a) => a.status === "failed");

  let retried = 0;
  let succeeded = 0;
  let failed = 0;

  for (const allocation of failedAllocations) {
    retried++;
    const token = getTokenById(allocation.token_id);
    if (!token) {
      failed++;
      continue;
    }

    if (!isValidSolanaAddress(token.deployer_sol_address)) {
      failed++;
      continue;
    }

    try {
      const result = await secureSendSol(
        token.deployer_sol_address,
        allocation.submitter_lamports,
        "claim-distributor-retry"
      );

      if (result.success) {
        updateClaimAllocationStatus(allocation.id, "paid", result.signature);
        succeeded++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { retried, succeeded, failed };
}
