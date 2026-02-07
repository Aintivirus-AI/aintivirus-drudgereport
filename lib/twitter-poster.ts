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

const TWITTER_API_URL = "https://api.twitter.com/2/tweets";

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
 * Post a tweet to Twitter/X.
 */
async function postTweet(text: string): Promise<{
  success: boolean;
  tweetId?: string;
  error?: string;
}> {
  if (!isTwitterConfigured()) {
    return { success: false, error: "Twitter API credentials not configured" };
  }

  try {
    const authHeader = buildOAuthHeader("POST", TWITTER_API_URL);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const response = await fetch(TWITTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
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
 */
export async function tweetArticlePublished(opts: {
  headline: string;
  ticker?: string;
  pumpUrl?: string;
  articleUrl: string;
}): Promise<{ success: boolean; tweetId?: string; error?: string }> {
  const { headline, ticker, pumpUrl, articleUrl } = opts;

  // Truncate headline to fit within 280 chars with the rest of the tweet
  const maxHeadlineLen = 180;
  const truncatedHeadline =
    headline.length > maxHeadlineLen
      ? headline.substring(0, maxHeadlineLen - 3) + "..."
      : headline;

  let tweetText: string;

  if (ticker && pumpUrl) {
    tweetText =
      `BREAKING: ${truncatedHeadline}\n\n` +
      `$${ticker} token now LIVE\n\n` +
      `${articleUrl}`;
  } else {
    tweetText =
      `BREAKING: ${truncatedHeadline}\n\n` +
      `${articleUrl}`;
  }

  return postTweet(tweetText);
}
