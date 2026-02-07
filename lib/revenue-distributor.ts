import { 
  PublicKey, 
  LAMPORTS_PER_SOL, 
  VersionedTransaction,
  TransactionMessage,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createBurnInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  getConnection,
  getMasterWallet,
  sendSol,
  getMasterWalletBalance,
  isValidSolanaAddress,
  confirmTransactionPolling,
} from "./solana-wallet";
import {
  createRevenueEvent,
  getTokenById,
  updateRevenueEventStatus,
  getPendingRevenueEvents,
  getRevenueStats,
} from "./db";
import type { RevenueEvent, Token } from "./types";

// Configuration
const NEWS_TOKEN_MINT = process.env.NEWS_TOKEN_MINT;
const MIN_DISTRIBUTION_AMOUNT = 0.001 * LAMPORTS_PER_SOL; // Minimum 0.001 SOL to distribute

// Jupiter API
const JUPITER_QUOTE_API = "https://quote-api.jup.ag/v6/quote";
const JUPITER_SWAP_API = "https://quote-api.jup.ag/v6/swap";

// Native SOL mint address (wrapped SOL)
const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Revenue distribution result
 */
export interface DistributionResult {
  success: boolean;
  submitterTxSignature?: string;
  burnTxSignature?: string;
  error?: string;
}

/**
 * Record and distribute revenue from a token
 * @param tokenId - The token ID in our database
 * @param amountLamports - Total amount received in lamports
 */
export async function recordAndDistributeRevenue(
  tokenId: number,
  amountLamports: number
): Promise<DistributionResult> {
  console.log(`[Revenue] Recording revenue for token #${tokenId}: ${amountLamports / LAMPORTS_PER_SOL} SOL`);
  
  // Get token details
  const token = getTokenById(tokenId);
  if (!token) {
    return { success: false, error: "Token not found" };
  }
  
  if (!isValidSolanaAddress(token.deployer_sol_address)) {
    return { success: false, error: "Invalid submitter address" };
  }
  
  // Check minimum amount
  if (amountLamports < MIN_DISTRIBUTION_AMOUNT) {
    return { success: false, error: `Amount too small: ${amountLamports / LAMPORTS_PER_SOL} SOL` };
  }
  
  // Create revenue event record
  const revenueEvent = createRevenueEvent(tokenId, amountLamports);
  console.log(`[Revenue] Created revenue event #${revenueEvent.id}`);
  
  // Distribute the revenue
  return await distributeRevenue(revenueEvent, token);
}

/**
 * Distribute revenue for a recorded event
 */
async function distributeRevenue(
  event: RevenueEvent,
  token: Token
): Promise<DistributionResult> {
  const submitterShare = event.submitter_share_lamports;
  const burnShare = event.burn_share_lamports;
  
  console.log(`[Revenue] Distributing event #${event.id}:`);
  console.log(`  - Submitter: ${submitterShare / LAMPORTS_PER_SOL} SOL to ${token.deployer_sol_address}`);
  console.log(`  - Burn: ${burnShare / LAMPORTS_PER_SOL} SOL`);
  
  let submitterTxSignature: string | undefined;
  let burnTxSignature: string | undefined;
  
  // Step 1: Send 50% to submitter
  try {
    const submitterResult = await sendSol(token.deployer_sol_address, submitterShare);
    
    if (submitterResult.success) {
      submitterTxSignature = submitterResult.signature;
      updateRevenueEventStatus(event.id, "submitter_paid", submitterTxSignature);
      console.log(`[Revenue] Submitter paid: ${submitterTxSignature}`);
    } else {
      console.error(`[Revenue] Failed to pay submitter: ${submitterResult.error}`);
      updateRevenueEventStatus(event.id, "failed");
      return { success: false, error: `Failed to pay submitter: ${submitterResult.error}` };
    }
  } catch (error) {
    console.error("[Revenue] Error paying submitter:", error);
    updateRevenueEventStatus(event.id, "failed");
    return { success: false, error: "Failed to pay submitter" };
  }
  
  // Step 2: Buy and burn $NEWS (or just burn SOL if no NEWS token configured)
  try {
    if (NEWS_TOKEN_MINT) {
      // If NEWS token is configured, buy and burn
      const burnResult = await buyAndBurnNews(burnShare);
      
      if (burnResult.success) {
        burnTxSignature = burnResult.signature;
        updateRevenueEventStatus(event.id, "completed", undefined, burnTxSignature);
        console.log(`[Revenue] Buy & burn complete: ${burnTxSignature}`);
      } else {
        // Log warning but don't fail the whole distribution
        console.warn(`[Revenue] Buy & burn failed: ${burnResult.error}`);
        updateRevenueEventStatus(event.id, "submitter_paid"); // At least submitter was paid
      }
    } else {
      // No NEWS token configured - just mark as complete
      // In production, you might want to hold the burn share or use a different strategy
      console.log("[Revenue] No NEWS token configured, skipping burn");
      updateRevenueEventStatus(event.id, "completed");
    }
  } catch (error) {
    console.error("[Revenue] Error during burn:", error);
    // Don't fail - submitter was already paid
    updateRevenueEventStatus(event.id, "submitter_paid");
  }
  
  return {
    success: true,
    submitterTxSignature,
    burnTxSignature,
  };
}

/**
 * Jupiter DEX aggregator types
 */
interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  error?: string;
}

/**
 * Get a swap quote from Jupiter (with timeout)
 */
async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 50
): Promise<JupiterQuoteResponse> {
  const url = `${JUPITER_QUOTE_API}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jupiter quote failed: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Execute a Jupiter swap (with timeout)
 */
async function executeJupiterSwap(
  quoteResponse: JupiterQuoteResponse,
  userPublicKey: string
): Promise<{ swapTransaction: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(JUPITER_SWAP_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: "auto",
      }),
      signal: controller.signal,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jupiter swap failed: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Burn SPL tokens
 */
async function burnTokens(
  mintAddress: string,
  amount: bigint
): Promise<{ success: boolean; signature?: string; error?: string }> {
  const connection = getConnection();
  const wallet = getMasterWallet();
  const mint = new PublicKey(mintAddress);
  
  try {
    // Get the associated token account
    const tokenAccount = await getAssociatedTokenAddress(
      mint,
      wallet.publicKey
    );
    
    // Create burn instruction
    const burnIx = createBurnInstruction(
      tokenAccount,
      mint,
      wallet.publicKey,
      amount
    );
    
    // Build transaction
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    
    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions: [burnIx],
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([wallet]);
    
    // Send and confirm via polling (no WebSocket needed)
    const signature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
    });
    
    await confirmTransactionPolling(
      connection,
      signature,
      blockhash,
      lastValidBlockHeight,
      "confirmed"
    );
    
    console.log(`[Revenue] Burned ${amount} tokens. Signature: ${signature}`);
    
    return { success: true, signature };
  } catch (error) {
    console.error("[Revenue] Burn failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Burn failed",
    };
  }
}

/**
 * Buy $NEWS token and burn it
 * Uses Jupiter aggregator for best swap rate
 */
async function buyAndBurnNews(
  solLamports: number
): Promise<{ success: boolean; signature?: string; error?: string }> {
  if (!NEWS_TOKEN_MINT) {
    return { success: false, error: "NEWS_TOKEN_MINT not configured" };
  }
  
  console.log(`[Revenue] Buying and burning $NEWS with ${solLamports / LAMPORTS_PER_SOL} SOL`);
  
  const connection = getConnection();
  const wallet = getMasterWallet();
  
  try {
    // Step 1: Get quote from Jupiter for SOL -> NEWS
    console.log(`[Revenue] Getting Jupiter quote...`);
    const quote = await getJupiterQuote(
      NATIVE_SOL_MINT,
      NEWS_TOKEN_MINT,
      solLamports,
      100 // 1% slippage for safety
    );
    
    if (!quote || quote.error) {
      throw new Error(`Quote error: ${quote?.error || "No quote returned"}`);
    }
    
    const expectedOutput = quote.outAmount;
    console.log(`[Revenue] Quote: ${solLamports / LAMPORTS_PER_SOL} SOL -> ${expectedOutput} NEWS tokens`);
    
    // Step 2: Execute the swap
    console.log(`[Revenue] Executing swap...`);
    const { swapTransaction } = await executeJupiterSwap(
      quote,
      wallet.publicKey.toBase58()
    );
    
    // Get blockhash for polling-based confirmation
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");

    // Deserialize the transaction
    const swapTxBuffer = Buffer.from(swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(swapTxBuffer);
    
    // Sign it
    transaction.sign([wallet]);
    
    // Send the swap transaction
    const swapSignature = await connection.sendTransaction(transaction, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    
    // Wait for confirmation via polling (no WebSocket needed)
    await confirmTransactionPolling(
      connection,
      swapSignature,
      blockhash,
      lastValidBlockHeight,
      "confirmed"
    );
    
    console.log(`[Revenue] Swap complete. Signature: ${swapSignature}`);
    
    // Step 3: Burn the received NEWS tokens
    // Wait a moment for the swap to finalize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log(`[Revenue] Burning received NEWS tokens...`);
    const burnResult = await burnTokens(NEWS_TOKEN_MINT, BigInt(expectedOutput));
    
    if (!burnResult.success) {
      // Swap succeeded but burn failed - log warning but don't fail completely
      console.warn(`[Revenue] Burn failed after swap: ${burnResult.error}`);
      // The tokens are still removed from circulation as they're in our wallet
      // A manual burn can be done later
      return {
        success: true,
        signature: swapSignature,
        error: `Swap succeeded but burn failed: ${burnResult.error}`,
      };
    }
    
    console.log(`[Revenue] Buy & burn complete!`);
    console.log(`  Swap signature: ${swapSignature}`);
    console.log(`  Burn signature: ${burnResult.signature}`);
    
    return {
      success: true,
      signature: `${swapSignature}:${burnResult.signature}`,
    };
  } catch (error) {
    console.error("[Revenue] Buy and burn failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Process all pending revenue events (also retries stuck "submitter_paid" events
 * where the burn step failed).
 * Call this periodically (e.g., every 5 minutes).
 */
export async function processPendingRevenue(): Promise<{
  processed: number;
  failed: number;
  results: Array<{ eventId: number; success: boolean; error?: string }>;
}> {
  const pending = getPendingRevenueEvents(10);
  console.log(`[Revenue] Processing ${pending.length} pending revenue events`);
  
  const results: Array<{ eventId: number; success: boolean; error?: string }> = [];
  let processed = 0;
  let failed = 0;
  
  for (const event of pending) {
    const token = getTokenById(event.token_id);
    if (!token) {
      updateRevenueEventStatus(event.id, "failed");
      results.push({ eventId: event.id, success: false, error: "Token not found" });
      failed++;
      continue;
    }
    
    const result = await distributeRevenue(event, token);
    results.push({
      eventId: event.id,
      success: result.success,
      error: result.error,
    });
    
    if (result.success) {
      processed++;
    } else {
      failed++;
    }
    
    // Small delay between distributions
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`[Revenue] Processed: ${processed}, Failed: ${failed}`);
  return { processed, failed, results };
}

/**
 * Get revenue statistics
 */
export function getRevenueStatistics(): {
  totalLamports: number;
  totalSol: number;
  distributedLamports: number;
  distributedSol: number;
  burnedLamports: number;
  burnedSol: number;
} {
  const stats = getRevenueStats();
  
  return {
    totalLamports: stats.total,
    totalSol: stats.total / LAMPORTS_PER_SOL,
    distributedLamports: stats.distributed,
    distributedSol: stats.distributed / LAMPORTS_PER_SOL,
    burnedLamports: stats.burned,
    burnedSol: stats.burned / LAMPORTS_PER_SOL,
  };
}

/**
 * Estimate distribution for an amount.
 * Uses the same share percentage as db.createRevenueEvent (env-configurable).
 */
export function estimateDistribution(amountLamports: number): {
  submitterShare: number;
  burnShare: number;
  submitterShareSol: number;
  burnShareSol: number;
} {
  const sharePercent = parseFloat(process.env.REVENUE_SUBMITTER_SHARE || "0.5");
  const submitterShare = Math.floor(amountLamports * sharePercent);
  const burnShare = amountLamports - submitterShare;
  
  return {
    submitterShare,
    burnShare,
    submitterShareSol: submitterShare / LAMPORTS_PER_SOL,
    burnShareSol: burnShare / LAMPORTS_PER_SOL,
  };
}
