/**
 * Sends Telegram DM notifications to users for all submission outcomes:
 * approved, rejected, and published.
 * Runs within the scheduler worker process (which already has env vars loaded).
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/**
 * Escape Telegram Markdown special characters to prevent injection.
 */
function escapeTelegramMarkdown(text: string): string {
  return text.replace(/([_*`\[\]()~>#+\-=|{}.!])/g, "\\$1");
}

/**
 * Send a Telegram message to a specific user.
 * Reads BOT_TOKEN at call time (not module load time) to support env var loading after import.
 */
async function sendTelegramMessage(
  chatId: string,
  text: string,
  parseMode: "Markdown" | "HTML" = "Markdown"
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    console.warn("[TelegramNotifier] BOT_TOKEN not set, skipping notification");
    return false;
  }

  // Validate chatId is numeric
  if (!/^\d+$/.test(chatId)) {
    console.warn(`[TelegramNotifier] Invalid chatId: ${chatId}`);
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode,
          disable_web_page_preview: false,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const err = await response.text();
      console.error(`[TelegramNotifier] API error: ${err}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[TelegramNotifier] Failed to send message:", error);
    return false;
  }
}

/**
 * Notify a submitter that their article has been published and a token launched.
 */
export async function notifySubmitterPublished(opts: {
  telegramUserId: string;
  submissionId: number;
  headline: string;
  ticker?: string;
  pumpUrl?: string;
  headlineId: number;
}): Promise<void> {
  const { telegramUserId, submissionId, headline, ticker, pumpUrl, headlineId } = opts;
  const articleUrl = `${SITE_URL}/article/${headlineId}`;

  // Escape headline to prevent markdown injection from user-supplied content
  const safeHeadline = escapeTelegramMarkdown(headline);

  let message =
    `*Your submission is live*\n` +
    `─────────────────────\n\n` +
    `${safeHeadline}\n` +
    `[View on The McAfee Report](${articleUrl})\n`;

  if (ticker && pumpUrl) {
    message +=
      `\nToken launched: *$${escapeTelegramMarkdown(ticker)}*\n` +
      `[Trade on pump\\.fun](${pumpUrl})\n` +
      `\n50% of creator fees go to your wallet\\.`;
  }

  message += `\n\n_Submission \\#${submissionId}_`;

  const sent = await sendTelegramMessage(telegramUserId, message);
  if (sent) {
    console.log(
      `[TelegramNotifier] Notified user ${telegramUserId} about submission #${submissionId}`
    );
  }
}

/**
 * Notify a submitter that their article has been approved and is in the
 * publishing queue. Gives immediate positive feedback before the full
 * publish cycle (token deployment, etc.) completes.
 */
export async function notifySubmitterApproved(opts: {
  telegramUserId: string;
  submissionId: number;
  title: string;
}): Promise<void> {
  const { telegramUserId, submissionId, title } = opts;

  const safeTitle = escapeTelegramMarkdown(title || "your article");

  const message =
    `*Submission Approved* ✅\n` +
    `─────────────────────\n\n` +
    `${safeTitle}\n\n` +
    `Your submission has been approved and is now in the publishing queue\\.\n` +
    `You'll receive another notification once it's live with a token launch\\.\n\n` +
    `_Submission \\#${submissionId}_`;

  const sent = await sendTelegramMessage(telegramUserId, message);
  if (sent) {
    console.log(
      `[TelegramNotifier] Notified user ${telegramUserId} — approved #${submissionId}`
    );
  }
}

/**
 * Notify a submitter that their article has been rejected, with the reason.
 * Encourages them to try again with a different submission.
 */
export async function notifySubmitterRejected(opts: {
  telegramUserId: string;
  submissionId: number;
  url: string;
  rejectionReason: string;
}): Promise<void> {
  const { telegramUserId, submissionId, url, rejectionReason } = opts;

  const safeUrl = escapeTelegramMarkdown(
    url.length > 50 ? url.substring(0, 47) + "..." : url
  );
  const safeReason = escapeTelegramMarkdown(rejectionReason || "Unknown reason");

  const message =
    `*Submission Not Approved* ❌\n` +
    `─────────────────────\n\n` +
    `URL: \`${safeUrl}\`\n` +
    `Reason: ${safeReason}\n\n` +
    `Don't worry — you can submit another link with /submit\\.\n\n` +
    `_Submission \\#${submissionId}_`;

  const sent = await sendTelegramMessage(telegramUserId, message);
  if (sent) {
    console.log(
      `[TelegramNotifier] Notified user ${telegramUserId} — rejected #${submissionId}`
    );
  }
}

/**
 * Notify admins about important events.
 * Sends to all admins concurrently (not sequentially).
 */
export async function notifyAdmins(text: string): Promise<void> {
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .filter(Boolean);

  await Promise.allSettled(
    adminIds.map(adminId => sendTelegramMessage(adminId, text))
  );
}
