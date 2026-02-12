/**
 * Helius Webhook Endpoint
 *
 * Receives transaction notifications from Helius when the master wallet
 * receives SOL (i.e. creator fees from pump.fun). Matches the transaction
 * to a deployed token and triggers revenue distribution (50% to submitter,
 * 50% retained in creator wallet).
 *
 * Setup:
 * 1. Create a webhook at https://dashboard.helius.dev/webhooks
 * 2. Set the webhook URL to: https://yoursite.com/api/webhooks/helius
 * 3. Set the webhook type to "enhanced" transactions
 * 4. Filter to your master wallet address
 * 5. Set HELIUS_WEBHOOK_SECRET in your .env
 */

import { NextRequest, NextResponse } from "next/server";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getTokenByMintAddress } from "@/lib/db";
import { recordAndDistributeRevenue } from "@/lib/revenue-distributor";
import { safeCompare } from "@/lib/auth";

const MASTER_WALLET = process.env.MASTER_WALLET_PUBLIC_KEY || "";

// Minimum amount to process (avoid dust transactions)
const MIN_REVENUE_LAMPORTS = 10_000; // 0.00001 SOL

/**
 * Verify the webhook request is from Helius.
 * SECURITY: Defaults to DENY when the secret is not configured.
 */
function verifyWebhook(request: NextRequest): boolean {
  const webhookSecret = process.env.HELIUS_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("[HeliusWebhook] HELIUS_WEBHOOK_SECRET not configured — rejecting request");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  // Timing-safe comparison to prevent brute-force via side-channels
  return (
    safeCompare(authHeader, webhookSecret) ||
    safeCompare(authHeader, `Bearer ${webhookSecret}`)
  );
}

/**
 * Extract incoming SOL transfers to the master wallet from a Helius enhanced transaction.
 */
function extractIncomingTransfers(tx: HeliusTransaction): Array<{
  fromAddress: string;
  lamports: number;
  relatedMint?: string;
}> {
  const transfers: Array<{
    fromAddress: string;
    lamports: number;
    relatedMint?: string;
  }> = [];

  // Check native SOL transfers
  if (tx.nativeTransfers) {
    for (const transfer of tx.nativeTransfers) {
      if (
        transfer.toUserAccount === MASTER_WALLET &&
        transfer.amount >= MIN_REVENUE_LAMPORTS
      ) {
        transfers.push({
          fromAddress: transfer.fromUserAccount,
          lamports: transfer.amount,
          relatedMint: undefined,
        });
      }
    }
  }

  // Try to identify the related token mint from account data / token transfers
  if (tx.tokenTransfers) {
    for (const tt of tx.tokenTransfers) {
      if (tt.mint) {
        // If there's a token transfer in the same tx, associate the mint
        for (const t of transfers) {
          if (!t.relatedMint) {
            t.relatedMint = tt.mint;
          }
        }
      }
    }
  }

  return transfers;
}

/**
 * Try to match an incoming transfer to a token we deployed.
 * SECURITY: Only matches by explicit mint address — no dangerous fallbacks.
 */
function matchToToken(transfer: {
  fromAddress: string;
  lamports: number;
  relatedMint?: string;
}): number | null {
  // Only match by mint address — no guessing
  if (transfer.relatedMint) {
    const token = getTokenByMintAddress(transfer.relatedMint);
    if (token) return token.id;
  }

  return null;
}

// Helius enhanced transaction types
interface HeliusTransaction {
  signature: string;
  type: string;
  timestamp: number;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    tokenAmount: number;
  }>;
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
  }>;
}

/**
 * POST /api/webhooks/helius
 *
 * Receives Helius webhook payloads for master wallet transactions.
 */
export async function POST(request: NextRequest) {
  // Verify webhook authenticity
  if (!verifyWebhook(request)) {
    console.warn("[HeliusWebhook] Unauthorized request rejected");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Helius sends an array of transactions
    const transactions: HeliusTransaction[] = Array.isArray(body) ? body : [body];

    console.log(
      `[HeliusWebhook] Received ${transactions.length} transaction(s)`
    );

    let processed = 0;
    let distributed = 0;

    for (const tx of transactions) {
      processed++;
      console.log(
        `[HeliusWebhook] Processing tx ${tx.signature} (type: ${tx.type})`
      );

      // Extract incoming SOL transfers to the master wallet
      const transfers = extractIncomingTransfers(tx);

      for (const transfer of transfers) {
        console.log(
          `[HeliusWebhook] Incoming: ${transfer.lamports / LAMPORTS_PER_SOL} SOL`
        );

        // Try to match to a token
        const tokenId = matchToToken(transfer);

        if (tokenId) {
          console.log(
            `[HeliusWebhook] Matched to token #${tokenId}, distributing revenue...`
          );

          try {
            const result = await recordAndDistributeRevenue(
              tokenId,
              transfer.lamports
            );

            if (result.success) {
              distributed++;
              console.log(
                `[HeliusWebhook] Revenue distributed for token #${tokenId}`
              );
            } else {
              console.error(
                `[HeliusWebhook] Distribution failed: ${result.error}`
              );
            }
          } catch (distError) {
            console.error(
              `[HeliusWebhook] Distribution error:`,
              distError
            );
          }
        } else {
          console.log(
            `[HeliusWebhook] Could not match transfer to a token, skipping`
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      distributed,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("[HeliusWebhook] Error processing webhook:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/webhooks/helius
 * Minimal health check — no service information leaked.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
