/**
 * Token deployment on pump.fun.
 *
 * Changes from original:
 * - Imports getConnection/getMasterWallet from solana-wallet (single source of truth)
 * - Removed duplicate helper functions
 * - Removed dead imports (Transaction, sendAndConfirmTransaction)
 * - Image is persisted to permanent storage before deployment
 * - Metadata upload has retry logic; broken image-URL fallback removed
 * - All external HTTP calls have timeouts via AbortController
 */

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getConnection,
  getMasterWallet,
  getMasterWalletBalance,
  confirmTransactionPolling,
} from "./solana-wallet";
import {
  createToken,
  linkTokenToHeadline,
} from "./db";
import { persistImage, getImagePublicUrl } from "./image-store";
import type { Token, TokenMetadata } from "./types";

// Pump.fun API endpoints
const PUMP_FUN_API_URL = "https://pumpportal.fun/api";
const PUMP_FUN_IPFS_URL = "https://pump.fun/api/ipfs";

// Minimum SOL required for deployment (~0.02 SOL + fees)
const MIN_DEPLOYMENT_SOL = 0.03;

/** Token deployment result */
export interface DeploymentResult {
  success: boolean;
  mintAddress?: string;
  pumpUrl?: string;
  transactionSignature?: string;
  error?: string;
}

/**
 * Check if we have enough SOL for deployment.
 */
export async function checkDeploymentBalance(): Promise<{
  hasEnough: boolean;
  balance: number;
}> {
  const { sol } = await getMasterWalletBalance();
  return {
    hasEnough: sol >= MIN_DEPLOYMENT_SOL,
    balance: sol,
  };
}

/** Generate a new keypair for the token mint. */
function generateMintKeypair(): Keypair {
  return Keypair.generate();
}

/** Download image from URL and convert to Blob for upload.
 * Uses safeFetch for SSRF protection (image URLs can be user-influenced). */
async function downloadImageAsBlob(imageUrl: string): Promise<Blob> {
  // Import safeFetch to get SSRF protection
  const { safeFetch } = await import("./url-validator");
  const response = await safeFetch(imageUrl, {
    timeoutMs: 30_000,
    maxBytes: 10 * 1024 * 1024, // 10 MB max
    // Skip SSRF check only for known-safe hosts
    skipSsrfCheck: imageUrl.includes("oaidalleapiprodscus.blob.core.windows.net") ||
                   imageUrl.startsWith(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  });
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`);
  }
  return await response.blob();
}

/** Upload token metadata to pump.fun's IPFS. */
async function uploadMetadataToPumpFun(
  name: string,
  symbol: string,
  description: string,
  imageUrl: string
): Promise<string> {
  console.log(`[PumpDeployer] Uploading metadata to IPFS...`);

  const imageBlob = await downloadImageAsBlob(imageUrl);

  const formData = new FormData();
  formData.append("file", imageBlob, `${symbol}.png`);
  formData.append("name", name);
  formData.append("symbol", symbol);
  formData.append("description", description);
  formData.append("twitter", "");
  formData.append("telegram", "");
  formData.append("website", "");
  formData.append("showName", "true");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(PUMP_FUN_IPFS_URL, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to upload to IPFS: ${response.status} - ${errorText}`
      );
    }

    const result = await response.json();
    console.log(`[PumpDeployer] Metadata uploaded: ${result.metadataUri}`);
    return result.metadataUri;
  } finally {
    clearTimeout(timeout);
  }
}

/** Upload metadata with retry logic. */
async function uploadMetadataWithRetry(
  name: string,
  symbol: string,
  description: string,
  imageUrl: string,
  maxAttempts: number = 3
): Promise<string | null> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await uploadMetadataToPumpFun(name, symbol, description, imageUrl);
    } catch (error) {
      console.error(
        `[PumpDeployer] Metadata upload attempt ${attempt}/${maxAttempts} failed:`,
        error
      );
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }
  return null;
}

/** Create token using PumpPortal API (trade-enabled launch). */
async function createTokenViaPumpPortal(
  connection: Connection,
  wallet: Keypair,
  mintKeypair: Keypair,
  metadataUri: string,
  name: string,
  symbol: string
): Promise<{ signature: string }> {
  console.log(`[PumpDeployer] Creating token via PumpPortal API...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let txData: ArrayBuffer;
  try {
    const response = await fetch(`${PUMP_FUN_API_URL}/trade-local`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: wallet.publicKey.toBase58(),
        action: "create",
        tokenMetadata: { name, symbol, uri: metadataUri },
        mint: mintKeypair.publicKey.toBase58(),
        denominatedInSol: "true",
        amount: 0,
        slippage: 10,
        priorityFee: 0.0005,
        pool: "pump",
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `PumpPortal API error: ${response.status} - ${errorText}`
      );
    }

    txData = await response.arrayBuffer();
  } finally {
    clearTimeout(timeout);
  }

  // Get blockhash for polling-based confirmation
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
  tx.sign([wallet, mintKeypair]);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  // Use polling instead of WebSocket-based confirmTransaction
  await confirmTransactionPolling(
    connection,
    signature,
    blockhash,
    lastValidBlockHeight,
    "confirmed"
  );

  console.log(`[PumpDeployer] Token created with signature: ${signature}`);
  return { signature };
}

/**
 * Alternative: Create token using direct instruction building.
 * Fallback when PumpPortal is unavailable.
 */
async function createTokenDirect(
  connection: Connection,
  wallet: Keypair,
  mintKeypair: Keypair,
  name: string,
  symbol: string,
  metadataUri: string
): Promise<{ signature: string }> {
  console.log(`[PumpDeployer] Creating token via direct transaction...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let data: { transaction?: string };
  try {
    const response = await fetch(
      "https://pumpportal.fun/api/trade?api-version=2",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade: {
            publicKey: wallet.publicKey.toBase58(),
            action: "create",
            mint: mintKeypair.publicKey.toBase58(),
            tokenMetadata: { name, symbol, uri: metadataUri },
            denominatedInSol: true,
            amount: 0,
            slippage: 5, // 5% max — 50% was vulnerable to sandwich attacks
            priorityFee: 0.0001,
          },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get transaction: ${response.status}`);
    }

    data = await response.json();
  } finally {
    clearTimeout(timeout);
  }

  if (!data.transaction) {
    throw new Error("No transaction returned from API");
  }

  // Get blockhash for polling-based confirmation
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");

  const txBuffer = Buffer.from(data.transaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuffer);
  tx.sign([wallet, mintKeypair]);

  const signature = await connection.sendTransaction(tx, {
    skipPreflight: false,
  });

  await confirmTransactionPolling(
    connection,
    signature,
    blockhash,
    lastValidBlockHeight,
    "confirmed"
  );

  return { signature };
}

/**
 * Deploy a new token on pump.fun.
 */
export async function deployToken(
  metadata: TokenMetadata,
  submitterSolAddress: string,
  headlineId?: number,
  submissionId?: number
): Promise<DeploymentResult> {
  console.log(
    `[PumpDeployer] Starting deployment for "${metadata.name}" (${metadata.ticker})`
  );

  try {
    const connection = getConnection();
    const masterWallet = getMasterWallet();

    // Check balance
    const balanceCheck = await checkDeploymentBalance();
    if (!balanceCheck.hasEnough) {
      return {
        success: false,
        error: `Insufficient balance: ${balanceCheck.balance} SOL (need ${MIN_DEPLOYMENT_SOL} SOL)`,
      };
    }

    console.log(`[PumpDeployer] Wallet balance: ${balanceCheck.balance} SOL`);

    // Persist the token image to permanent storage before deployment
    let persistedImageUrl = metadata.imageUrl;
    try {
      persistedImageUrl = await persistImage(
        metadata.imageUrl,
        metadata.ticker
      );
      console.log(`[PumpDeployer] Image persisted: ${persistedImageUrl}`);
    } catch (imgError) {
      console.warn(
        `[PumpDeployer] Image persistence failed, using original URL:`,
        imgError
      );
    }

    // Generate mint keypair
    const mintKeypair = generateMintKeypair();
    const mintAddress = mintKeypair.publicKey.toBase58();
    console.log(`[PumpDeployer] Generated mint address: ${mintAddress}`);

    // Token description
    const description =
      "News token for breaking news. Powered by The McAfee Report.";

    // Resolve image URL to a full public URL for IPFS upload
    const imageUrlForUpload = persistedImageUrl.startsWith("/")
      ? getImagePublicUrl(persistedImageUrl)
      : persistedImageUrl;

    // Upload metadata to IPFS (with retry)
    const metadataUri = await uploadMetadataWithRetry(
      metadata.name,
      metadata.ticker,
      description,
      imageUrlForUpload
    );

    if (!metadataUri) {
      return {
        success: false,
        error: "Failed to upload token metadata after multiple attempts",
      };
    }

    const pumpUrl = `https://pump.fun/coin/${mintAddress}`;

    // Try PumpPortal API first, then direct method as fallback
    // IMPORTANT: On-chain deployment happens BEFORE database record creation
    // to prevent orphan records if deployment fails.
    let signature: string;
    try {
      const result = await createTokenViaPumpPortal(
        connection,
        masterWallet,
        mintKeypair,
        metadataUri,
        metadata.name,
        metadata.ticker
      );
      signature = result.signature;
    } catch (portalError) {
      console.warn(
        `[PumpDeployer] PumpPortal failed, trying direct method:`,
        portalError
      );
      const result = await createTokenDirect(
        connection,
        masterWallet,
        mintKeypair,
        metadata.name,
        metadata.ticker,
        metadataUri
      );
      signature = result.signature;
    }

    // Create token record in database AFTER on-chain success
    // (prevents orphan records when deployment fails)
    const tokenRecord = createToken(
      metadata.name,
      metadata.ticker,
      submitterSolAddress,
      headlineId,
      submissionId,
      persistedImageUrl,
      mintAddress,
      pumpUrl
    );

    console.log(`[PumpDeployer] Created token record #${tokenRecord.id}`);

    // Link to headline if provided
    if (headlineId) {
      linkTokenToHeadline(tokenRecord.id, headlineId);
    }

    console.log(`[PumpDeployer] Deployment successful!`);
    console.log(`[PumpDeployer] Mint: ${mintAddress}`);
    console.log(`[PumpDeployer] URL: ${pumpUrl}`);
    console.log(`[PumpDeployer] Signature: ${signature}`);

    return {
      success: true,
      mintAddress,
      pumpUrl,
      transactionSignature: signature,
    };
  } catch (error) {
    console.error("[PumpDeployer] Deployment failed:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Unknown deployment error",
    };
  }
}

/** Get token info from pump.fun. */
export async function getTokenInfo(
  mintAddress: string
): Promise<{
  exists: boolean;
  price?: number;
  marketCap?: number;
  volume24h?: number;
}> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let data: Record<string, unknown>;
    try {
      const response = await fetch(
        `https://frontend-api.pump.fun/coins/${mintAddress}`,
        { signal: controller.signal }
      );
      if (!response.ok) return { exists: false };
      data = await response.json();
    } finally {
      clearTimeout(timeout);
    }

    return {
      exists: true,
      price: data.price as number | undefined,
      marketCap: data.usd_market_cap as number | undefined,
      volume24h: data.volume_24h as number | undefined,
    };
  } catch (error) {
    console.error("[PumpDeployer] Error fetching token info:", error);
    return { exists: false };
  }
}

/** Deployment configuration check. */
export async function checkDeploymentConfig(): Promise<{
  configured: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  try {
    getMasterWallet();
  } catch (error) {
    issues.push(
      error instanceof Error ? error.message : "Invalid wallet configuration"
    );
  }

  if (!process.env.SOLANA_RPC_URL) {
    issues.push("SOLANA_RPC_URL not set (using default mainnet)");
  }

  try {
    const connection = getConnection();
    await connection.getLatestBlockhash();
  } catch {
    issues.push("Cannot connect to Solana RPC");
  }

  if (issues.length === 0) {
    try {
      const balanceCheck = await checkDeploymentBalance();
      if (!balanceCheck.hasEnough) {
        issues.push(
          `Insufficient balance: ${balanceCheck.balance} SOL (need ${MIN_DEPLOYMENT_SOL} SOL)`
        );
      }
    } catch {
      issues.push("Cannot check wallet balance");
    }
  }

  return { configured: issues.length === 0, issues };
}
