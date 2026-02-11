/**
 * Scheduler logic for validating and publishing submissions.
 *
 * Queue strategy:
 * - Validates up to 10 pending submissions per cycle
 * - Publishes up to 3 approved submissions per cycle (not just 1)
 * - Fair user interleaving: round-robins across different submitters
 *   so one power user can't dominate the queue
 * - Caches fetched content during validation to avoid double-fetch
 */

import {
  getSubmissionsByStatus,
  updateSubmissionStatus,
  markSubmissionPublished,
  getPublishedTodayCount,
  addHeadline,
  getSubmissionById,
  getSubmissionCountByStatus,
  updateSubmissionCachedContent,
  updateHeadlineImportanceScore,
  updateHeadlineMcAfeeTake,
} from "./db";
import { validateSubmission, smartFetchContent } from "./ai-validator";
import { generateTokenMetadata } from "./token-generator";
import { deployToken } from "./pump-deployer";
import { notifySubmitterPublished, notifySubmitterApproved, notifySubmitterRejected } from "./telegram-notifier";
import { tweetArticlePublished, isTwitterConfigured } from "./twitter-poster";
import { generateMcAfeeTake, scoreHeadlineImportance } from "./mcafee-commentator";
import { ActivityLog } from "./activity-logger";
import { ensureEnglish } from "./translator";
import type { Submission, PageContent } from "./types";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

// Configuration
const MAX_ARTICLES_PER_DAY = 72;
const VALIDATION_BATCH_SIZE = 10;  // validate up to 10 per cycle (was 5)
const PUBLISH_BATCH_SIZE = 3;      // publish up to 3 per cycle (was 1)

/**
 * Process the validation queue – validate pending submissions.
 */
export async function processValidationQueue(): Promise<number> {
  console.log("[Scheduler] Processing validation queue...");

  const pendingSubmissions = getSubmissionsByStatus(
    "pending",
    VALIDATION_BATCH_SIZE
  );

  if (pendingSubmissions.length === 0) {
    console.log("[Scheduler] No pending submissions to validate");
    return 0;
  }

  console.log(
    `[Scheduler] Found ${pendingSubmissions.length} pending submissions`
  );

  let validated = 0;

  for (const submission of pendingSubmissions) {
    try {
      // Mark as validating
      updateSubmissionStatus(submission.id, "validating");
      ActivityLog.validationStarted(submission.id, submission.url);
      console.log(
        `[Scheduler] Validating submission #${submission.id}: ${submission.url}`
      );

      // Fetch content
      const content = await smartFetchContent(submission.url);

      if (!content.title && !content.description) {
        updateSubmissionStatus(
          submission.id,
          "rejected",
          "Could not fetch content from URL"
        );
        console.log(
          `[Scheduler] Rejected #${submission.id}: Could not fetch content`
        );
        validated++;
        continue;
      }

      // Cache the fetched content so we don't have to re-fetch during publishing
      try {
        const cachedContent = {
          title: content.title,
          description: content.description,
          content: content.content,
          imageUrl: content.imageUrl,
          publishedAt: content.publishedAt?.toISOString() || null,
        };
        updateSubmissionCachedContent(
          submission.id,
          JSON.stringify(cachedContent)
        );
      } catch (cacheError) {
        console.warn(
          `[Scheduler] Failed to cache content for #${submission.id}:`,
          cacheError
        );
      }

      // Run validation
      const result = await validateSubmission(
        submission.id,
        submission.url,
        content
      );

      if (result.isValid) {
        updateSubmissionStatus(submission.id, "approved");
        ActivityLog.approved(submission.id, content.title || "Untitled");
        console.log(
          `[Scheduler] Approved #${submission.id} (fact: ${result.factScore}, fresh: ${result.freshnessHours}h)`
        );

        // Notify the submitter immediately — fire-and-forget
        notifySubmitterApproved({
          telegramUserId: submission.telegram_user_id,
          submissionId: submission.id,
          title: content.title || "Untitled",
        }).catch((err) =>
          console.warn(`[Scheduler] Failed to send approval notification:`, err)
        );
      } else {
        updateSubmissionStatus(
          submission.id,
          "rejected",
          result.rejectionReason
        );
        ActivityLog.rejected(submission.id, result.rejectionReason || "Unknown reason");
        console.log(
          `[Scheduler] Rejected #${submission.id}: ${result.rejectionReason}`
        );

        // Notify the submitter about the rejection — fire-and-forget
        notifySubmitterRejected({
          telegramUserId: submission.telegram_user_id,
          submissionId: submission.id,
          url: submission.url,
          rejectionReason: result.rejectionReason || "Unknown reason",
        }).catch((err) =>
          console.warn(`[Scheduler] Failed to send rejection notification:`, err)
        );
      }

      validated++;
    } catch (error) {
      console.error(
        `[Scheduler] Error validating submission #${submission.id}:`,
        error
      );
      updateSubmissionStatus(
        submission.id,
        "rejected",
        "Validation error – please try again"
      );

      // Notify about the technical error — fire-and-forget
      notifySubmitterRejected({
        telegramUserId: submission.telegram_user_id,
        submissionId: submission.id,
        url: submission.url,
        rejectionReason: "Validation error – please try again with /submit",
      }).catch((err) =>
        console.warn(`[Scheduler] Failed to send error notification:`, err)
      );

      validated++;
    }
  }

  return validated;
}

/**
 * Fair interleave: reorder submissions so different users alternate.
 *
 * Given [A1, A2, A3, B1, C1, C2] (sorted by created_at ASC),
 * produces [A1, B1, C1, A2, C2, A3] — round-robin across users.
 *
 * Within each user's group, FIFO order is preserved (oldest first).
 */
function fairInterleave(submissions: Submission[]): Submission[] {
  // Group by submitter, preserving FIFO within each group
  const byUser = new Map<string, Submission[]>();
  for (const sub of submissions) {
    const userId = sub.telegram_user_id;
    if (!byUser.has(userId)) {
      byUser.set(userId, []);
    }
    byUser.get(userId)!.push(sub);
  }

  // Round-robin across groups
  const result: Submission[] = [];
  const groups = [...byUser.values()];
  let exhausted = 0;
  let round = 0;

  while (exhausted < groups.length) {
    exhausted = 0;
    for (const group of groups) {
      if (round < group.length) {
        result.push(group[round]);
      } else {
        exhausted++;
      }
    }
    round++;
  }

  return result;
}

/**
 * Publish a single approved submission.
 * Extracted from the old publishNextApproved for reuse in the batch loop.
 */
async function publishOneSubmission(submission: Submission): Promise<Submission | null> {
  console.log(`[Scheduler] Publishing submission #${submission.id}`);

  try {
    // Use cached content if available, otherwise re-fetch
    let content: PageContent;
    if (submission.cached_content) {
      try {
        const cached = JSON.parse(submission.cached_content);
        content = {
          title: cached.title || "",
          description: cached.description || "",
          content: cached.content || "",
          imageUrl: cached.imageUrl || null,
          publishedAt: cached.publishedAt
            ? new Date(cached.publishedAt)
            : undefined,
        };
        console.log(
          `[Scheduler] Using cached content for submission #${submission.id}`
        );
      } catch {
        console.warn(
          `[Scheduler] Failed to parse cached content, re-fetching...`
        );
        content = await smartFetchContent(submission.url);
      }
    } else {
      content = await smartFetchContent(submission.url);
    }

    // Translate non-English content to English
    const translated = await ensureEnglish(
      content.title || "",
      content.description || ""
    );
    if (translated.translated) {
      console.log(
        `[Scheduler] Translated from ${translated.detectedLanguage}: "${content.title}" → "${translated.title}"`
      );
      content.title = translated.title;
      content.description = translated.description;

      // Update cached content so article summary also shows English
      try {
        const updatedCache = {
          title: content.title,
          description: content.description,
          content: content.content,
          imageUrl: content.imageUrl,
          publishedAt: content.publishedAt?.toISOString() || null,
        };
        updateSubmissionCachedContent(submission.id, JSON.stringify(updatedCache));
      } catch {
        // Non-fatal — headline will still be in English
      }
    }

    // Use the (possibly translated) title as the headline
    const headline = content.title || "Breaking News";

    // Alternate left/right column based on ID
    const column = submission.id % 2 === 0 ? "left" : "right";

    // Add headline to the site
    const headlineRecord = addHeadline(
      headline,
      submission.url,
      column as "left" | "right",
      content.imageUrl || undefined
    );

    console.log(
      `[Scheduler] Created headline #${headlineRecord.id} for submission #${submission.id}`
    );

    // Generate AI importance score + McAfee commentary in parallel with token generation
    const aiEnrichmentPromise = (async () => {
      try {
        const [importanceScore, mcafeeTake] = await Promise.all([
          scoreHeadlineImportance(headline, content),
          generateMcAfeeTake(headline, content),
        ]);

        updateHeadlineImportanceScore(headlineRecord.id, importanceScore);
        updateHeadlineMcAfeeTake(headlineRecord.id, mcafeeTake);

        console.log(
          `[Scheduler] AI enrichment for #${headlineRecord.id}: importance=${importanceScore}, take="${mcafeeTake.slice(0, 50)}..."`
        );
      } catch (aiError) {
        console.warn(`[Scheduler] AI enrichment failed (non-fatal):`, aiError);
      }
    })();

    // Generate token metadata and deploy
    let deployedTicker: string | undefined;
    let deployedPumpUrl: string | undefined;
    let deployedDescription: string | undefined;
    let deployedImageUrl: string | undefined;

    try {
      console.log(
        `[Scheduler] Generating token metadata for headline #${headlineRecord.id}`
      );
      const tokenMetadata = await generateTokenMetadata(headline, content);

      console.log(
        `[Scheduler] Deploying token: ${tokenMetadata.name} (${tokenMetadata.ticker})`
      );
      const deployResult = await deployToken(
        tokenMetadata,
        submission.sol_address,
        headlineRecord.id,
        submission.id,
        `${SITE_URL}/article/${headlineRecord.id}`
      );

      if (deployResult.success) {
        deployedTicker = tokenMetadata.ticker;
        deployedPumpUrl = deployResult.pumpUrl;
        deployedDescription = tokenMetadata.description;
        deployedImageUrl = tokenMetadata.imageUrl;
        ActivityLog.tokenMinted(tokenMetadata.ticker, headline, deployResult.mintAddress);
        console.log(
          `[Scheduler] Token deployed: ${deployResult.mintAddress}`
        );
        console.log(`[Scheduler] Pump.fun URL: ${deployResult.pumpUrl}`);
      } else {
        console.error(
          `[Scheduler] Token deployment failed: ${deployResult.error}`
        );
      }
    } catch (tokenError) {
      console.error(
        `[Scheduler] Token generation/deployment error:`,
        tokenError
      );
    }

    // Wait for AI enrichment to complete before marking as published
    await aiEnrichmentPromise;

    // Mark as published
    markSubmissionPublished(submission.id);

    // Log to activity feed
    ActivityLog.headlinePublished(headlineRecord.id, headline, deployedTicker);

    // Notify the submitter via Telegram
    try {
      await notifySubmitterPublished({
        telegramUserId: submission.telegram_user_id,
        submissionId: submission.id,
        headline,
        ticker: deployedTicker,
        pumpUrl: deployedPumpUrl,
        headlineId: headlineRecord.id,
      });
    } catch (notifyError) {
      console.warn(`[Scheduler] Failed to notify submitter:`, notifyError);
    }

    // Auto-post to Twitter/X
    if (isTwitterConfigured()) {
      try {
        const tweetResult = await tweetArticlePublished({
          headline,
          ticker: deployedTicker,
          pumpUrl: deployedPumpUrl,
          articleUrl: `${SITE_URL}/article/${headlineRecord.id}`,
          description: deployedDescription,
          imageUrl: deployedImageUrl,
        });
        if (tweetResult.success) {
          console.log(`[Scheduler] Tweeted: ${tweetResult.tweetId}`);
        } else {
          console.warn(`[Scheduler] Tweet failed: ${tweetResult.error}`);
        }
      } catch (tweetError) {
        console.warn(`[Scheduler] Tweet error:`, tweetError);
      }
    }

    return getSubmissionById(submission.id) || submission;
  } catch (error) {
    console.error(
      `[Scheduler] Error publishing submission #${submission.id}:`,
      error
    );
    // Don't reject – leave as approved for retry
    return null;
  }
}

/**
 * Publish up to PUBLISH_BATCH_SIZE approved submissions, using fair
 * round-robin across submitters so no single user dominates.
 *
 * Returns the list of successfully published submissions.
 */
export async function publishApprovedBatch(): Promise<Submission[]> {
  // Check daily limit
  const publishedToday = getPublishedTodayCount();
  const remaining = MAX_ARTICLES_PER_DAY - publishedToday;
  if (remaining <= 0) {
    console.log(
      `[Scheduler] Daily limit reached (${publishedToday}/${MAX_ARTICLES_PER_DAY})`
    );
    return [];
  }

  // Fetch more than we need so fair interleaving has room to work
  const approved = getSubmissionsByStatus("approved", PUBLISH_BATCH_SIZE * 5);
  if (approved.length === 0) {
    console.log("[Scheduler] No approved submissions to publish");
    return [];
  }

  // Fair interleave across different submitters
  const ordered = fairInterleave(approved);

  // Publish up to the batch size (or daily remaining, whichever is smaller)
  const toPublish = ordered.slice(0, Math.min(PUBLISH_BATCH_SIZE, remaining));

  console.log(
    `[Scheduler] Publishing ${toPublish.length} submissions (${approved.length} approved, ` +
    `${remaining} daily slots remaining)`
  );

  const published: Submission[] = [];

  for (const submission of toPublish) {
    const result = await publishOneSubmission(submission);
    if (result) {
      published.push(result);
    }

    // Small delay between deployments to avoid RPC rate limits
    if (published.length < toPublish.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log(`[Scheduler] Published ${published.length}/${toPublish.length} submissions`);
  return published;
}

/**
 * Backwards-compatible: publish a single submission (used by API trigger).
 */
export async function publishNextApproved(): Promise<Submission | null> {
  const batch = await publishApprovedBatch();
  return batch.length > 0 ? batch[0] : null;
}

/**
 * Get scheduler status using efficient COUNT queries.
 */
export function getSchedulerStatus(): {
  publishedToday: number;
  maxPerDay: number;
  pendingCount: number;
  approvedCount: number;
  validatingCount: number;
  queueDepth: number;
} {
  const pendingCount = getSubmissionCountByStatus("pending");
  const approvedCount = getSubmissionCountByStatus("approved");
  const validatingCount = getSubmissionCountByStatus("validating");

  return {
    publishedToday: getPublishedTodayCount(),
    maxPerDay: MAX_ARTICLES_PER_DAY,
    pendingCount,
    approvedCount,
    validatingCount,
    queueDepth: pendingCount + approvedCount + validatingCount,
  };
}

/**
 * Determine the optimal interval (in ms) until the next cycle
 * based on current queue depth.
 *
 * These intervals are a safety net — the primary trigger is now
 * event-driven (bot fires HTTP POST on each submission). The timer
 * catches anything that slips through.
 *
 *   queueDepth > 10  →   2 minutes (sprint mode)
 *   queueDepth > 0   →   5 minutes (active)
 *   queueDepth == 0  →  10 minutes (idle)
 */
export function getNextIntervalMs(): number {
  const { queueDepth } = getSchedulerStatus();

  if (queueDepth > 10) return 2 * 60 * 1000;   //  2 min
  if (queueDepth > 0)  return 5 * 60 * 1000;    //  5 min
  return 10 * 60 * 1000;                         // 10 min
}

/**
 * Run a full scheduler cycle:
 * 1. Process validation queue (up to 10)
 * 2. Publish approved submissions (up to 3, fair-interleaved)
 */
export async function runSchedulerCycle(): Promise<{
  validated: number;
  published: Submission[];
}> {
  console.log("[Scheduler] Starting scheduler cycle...");
  console.log(`[Scheduler] Status: ${JSON.stringify(getSchedulerStatus())}`);

  const validated = await processValidationQueue();
  const published = await publishApprovedBatch();

  console.log(
    `[Scheduler] Cycle complete — validated ${validated}, published ${published.length}`
  );

  return { validated, published };
}
