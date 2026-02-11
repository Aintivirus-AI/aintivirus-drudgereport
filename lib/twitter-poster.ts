/**
 * Twitter/X auto-posting for published articles.
 *
 * Uses the Twitter API v2 with OAuth 1.0a (user-context) for posting tweets.
 *
 * Required env vars:
 * - TWITTER_API_KEY: API Key (Consumer Key)
 * - TWITTER_API_SECRET: API Secret (Consumer Secret)
 * - TWITTER_ACCESS_TOKEN: Access Token
 * - TWITTER_ACCESS_SECRET: Access Token Secret
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

const TWITTER_API_URL = "https://api.twitter.com/2/tweets";
const TWITTER_MEDIA_UPLOAD_URL = "https://upload.twitter.com/1.1/media/upload.json";

/**
 * Read credentials at call time (NOT module load time) so that env vars
 * loaded by dotenv after the module is first imported are picked up.
 */
function getCredentials() {
  return {
    apiKey: process.env.TWITTER_API_KEY || "",
    apiSecret: process.env.TWITTER_API_SECRET || "",
    accessToken: process.env.TWITTER_ACCESS_TOKEN || "",
    accessSecret: process.env.TWITTER_ACCESS_SECRET || "",
  };
}

/**
 * Check if Twitter posting is configured.
 * Logs which credentials are missing to aid debugging.
 */
export function isTwitterConfigured(): boolean {
  const creds = getCredentials();
  const missing: string[] = [];

  if (!creds.apiKey) missing.push("TWITTER_API_KEY");
  if (!creds.apiSecret) missing.push("TWITTER_API_SECRET");
  if (!creds.accessToken) missing.push("TWITTER_ACCESS_TOKEN");
  if (!creds.accessSecret) missing.push("TWITTER_ACCESS_SECRET");

  if (missing.length > 0) {
    console.warn(
      `[Twitter] Not configured — missing env vars: ${missing.join(", ")}`
    );
    return false;
  }

  return true;
}

/**
 * Generate OAuth 1.0a signature for Twitter API.
 */
function generateOAuthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");

  const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;

  return crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");
}

/**
 * Build the OAuth 1.0a Authorization header.
 */
function buildOAuthHeader(method: string, url: string): string {
  const creds = getCredentials();
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: "1.0",
  };

  const signature = generateOAuthSignature(
    method,
    url,
    oauthParams,
    creds.apiSecret,
    creds.accessSecret
  );

  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

/**
 * Upload an image to Twitter and return the media_id_string.
 * Uses the v1.1 media upload endpoint with multipart/form-data.
 */
async function uploadMedia(imageBuffer: Buffer): Promise<string | null> {
  try {
    const base64Data = imageBuffer.toString("base64");

    // Build OAuth header for media upload (needs form params in signature)
    const creds = getCredentials();
    const oauthParams: Record<string, string> = {
      oauth_consumer_key: creds.apiKey,
      oauth_nonce: crypto.randomBytes(16).toString("hex"),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: creds.accessToken,
      oauth_version: "1.0",
    };

    const signature = generateOAuthSignature(
      "POST",
      TWITTER_MEDIA_UPLOAD_URL,
      oauthParams,
      creds.apiSecret,
      creds.accessSecret
    );

    oauthParams.oauth_signature = signature;

    const headerParts = Object.keys(oauthParams)
      .sort()
      .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
      .join(", ");

    const authHeader = `OAuth ${headerParts}`;

    // Use multipart form with base64
    const boundary = `----TwitterMediaBoundary${crypto.randomBytes(8).toString("hex")}`;
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="media_data"\r\n\r\n` +
      `${base64Data}\r\n` +
      `--${boundary}--\r\n`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(TWITTER_MEDIA_UPLOAD_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[Twitter] Media upload error ${response.status}: ${errBody}`);
      return null;
    }

    const data = await response.json();
    const mediaId = data?.media_id_string;
    console.log(`[Twitter] Media uploaded: ${mediaId}`);
    return mediaId;
  } catch (error) {
    console.error("[Twitter] Media upload failed:", error);
    return null;
  }
}

/**
 * Read a local token image from disk and return its buffer.
 */
function readLocalImage(imageUrl: string): Buffer | null {
  if (!imageUrl.startsWith("/tokens/")) return null;
  try {
    const filePath = path.join(process.cwd(), "public", imageUrl);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

/**
 * Post a tweet to Twitter/X, optionally with an attached image.
 */
async function postTweet(text: string, mediaId?: string): Promise<{
  success: boolean;
  tweetId?: string;
  error?: string;
}> {
  if (!isTwitterConfigured()) {
    return { success: false, error: "Twitter API credentials not configured" };
  }

  try {
    const authHeader = buildOAuthHeader("POST", TWITTER_API_URL);

    const body: Record<string, unknown> = { text };
    if (mediaId) {
      body.media = { media_ids: [mediaId] };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(TWITTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[Twitter] API error ${response.status}: ${errBody}`);
      return { success: false, error: `Twitter API ${response.status}` };
    }

    const data = await response.json();
    const tweetId = data?.data?.id;

    console.log(`[Twitter] Tweet posted: ${tweetId}`);
    return { success: true, tweetId };
  } catch (error) {
    console.error("[Twitter] Failed to post tweet:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Post a tweet announcing a published article and its token launch.
 * Attaches the token image so it shows as the tweet picture.
 */
export async function tweetArticlePublished(opts: {
  headline: string;
  ticker?: string;
  pumpUrl?: string;
  articleUrl: string;
  description?: string;
  imageUrl?: string;
}): Promise<{ success: boolean; tweetId?: string; error?: string }> {
  const { headline, ticker, pumpUrl, articleUrl, description, imageUrl } = opts;

  // Strip "Powered by The McAfee Report" from description for the tweet
  const synopsis = description
    ?.replace(/\n*Powered by The McAfee Report\.?/i, "")
    .trim();

  // Build the tweet: headline, synopsis, ticker + links
  const parts: string[] = [];

  // Headline (truncate if needed, leaving room for the rest)
  const maxHeadlineLen = synopsis ? 100 : 160;
  const truncatedHeadline =
    headline.length > maxHeadlineLen
      ? headline.substring(0, maxHeadlineLen - 3) + "..."
      : headline;
  parts.push(truncatedHeadline);

  // AI synopsis of the event
  if (synopsis) {
    const maxSynopsisLen = 120;
    const truncatedSynopsis =
      synopsis.length > maxSynopsisLen
        ? synopsis.substring(0, maxSynopsisLen - 3) + "..."
        : synopsis;
    parts.push(truncatedSynopsis);
  }

  // Token launch line + links
  if (ticker && pumpUrl) {
    parts.push(`$${ticker} just launched on @pumpdotfun`);
    parts.push(pumpUrl);
  }

  parts.push(articleUrl);

  const tweetText = parts.join("\n\n");

  // Upload the token image so it shows as the tweet picture
  let mediaId: string | undefined;
  if (imageUrl) {
    const imageBuffer = readLocalImage(imageUrl);
    if (imageBuffer) {
      mediaId = (await uploadMedia(imageBuffer)) ?? undefined;
    }
  }

  return postTweet(tweetText, mediaId);
}
