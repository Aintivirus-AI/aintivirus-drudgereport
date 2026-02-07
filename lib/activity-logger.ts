/**
 * Activity Logger for the War Room feed.
 *
 * Provides a simple utility to log platform events (submissions, validations,
 * token mints, votes, etc.) to the activity_log table. These events are
 * displayed in the War Room live feed.
 */

import { insertActivityLog } from "./db";
import type { ActivityEventType } from "./types";

/**
 * Log a platform activity event.
 */
export function logActivity(
  eventType: ActivityEventType,
  message: string,
  metadata?: Record<string, unknown>
): void {
  try {
    insertActivityLog(eventType, message, metadata);
  } catch (error) {
    // Never let logging failures break the main flow
    console.error("[ActivityLogger] Failed to log event:", error);
  }
}

/**
 * Convenience helpers for common events.
 */
export const ActivityLog = {
  submissionReceived(username: string | null, url: string) {
    logActivity(
      "submission_received",
      `${username ? `@${username}` : "Anonymous"} submitted a news tip`,
      { username, url: url.slice(0, 100) }
    );
  },

  validationStarted(submissionId: number, url: string) {
    logActivity(
      "validation_started",
      `Validating submission #${submissionId}`,
      { submissionId, url: url.slice(0, 100) }
    );
  },

  approved(submissionId: number, headline: string) {
    logActivity(
      "approved",
      `Submission #${submissionId} approved: "${headline.slice(0, 80)}"`,
      { submissionId, headline }
    );
  },

  rejected(submissionId: number, reason: string) {
    logActivity(
      "rejected",
      `Submission #${submissionId} rejected: ${reason.slice(0, 80)}`,
      { submissionId, reason }
    );
  },

  tokenMinted(ticker: string, headline: string, mintAddress?: string) {
    logActivity(
      "token_minted",
      `$${ticker} token minted for "${headline.slice(0, 60)}"`,
      { ticker, headline, mintAddress }
    );
  },

  headlinePublished(headlineId: number, headline: string, ticker?: string) {
    logActivity(
      "headline_published",
      `Published: "${headline.slice(0, 80)}"${ticker ? ` [$${ticker}]` : ""}`,
      { headlineId, headline, ticker }
    );
  },

  voteCast(headlineId: number, voteType: "wagmi" | "ngmi") {
    logActivity(
      "vote_cast",
      `Someone voted ${voteType.toUpperCase()} on headline #${headlineId}`,
      { headlineId, voteType }
    );
  },
};
