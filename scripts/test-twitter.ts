/**
 * Quick Twitter API diagnostic script.
 *
 * Tests three things:
 * 1. Are all env vars present?
 * 2. Can we authenticate? (GET /2/users/me)
 * 3. Can we post a tweet? (POST /2/tweets) — only if you pass --post flag
 *
 * Usage:
 *   npx tsx scripts/test-twitter.ts          # auth check only (safe, read-only)
 *   npx tsx scripts/test-twitter.ts --post   # actually posts a test tweet
 */

import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";

// Load env vars
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const API_KEY = process.env.TWITTER_API_KEY || "";
const API_SECRET = process.env.TWITTER_API_SECRET || "";
const ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN || "";
const ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET || "";

// ── helpers ──────────────────────────────────────────────

function generateSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret: string
): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&");
  const base = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sorted)}`;
  const key = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  return crypto.createHmac("sha1", key).update(base).digest("base64");
}

function oauthHeader(method: string, url: string): string {
  const params: Record<string, string> = {
    oauth_consumer_key: API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  params.oauth_signature = generateSignature(method, url, params, API_SECRET, ACCESS_SECRET);
  const header = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(params[k])}"`)
    .join(", ");
  return `OAuth ${header}`;
}

// ── tests ────────────────────────────────────────────────

async function checkEnv() {
  console.log("\n=== 1. ENV VAR CHECK ===\n");
  const vars = {
    TWITTER_API_KEY: API_KEY,
    TWITTER_API_SECRET: API_SECRET,
    TWITTER_ACCESS_TOKEN: ACCESS_TOKEN,
    TWITTER_ACCESS_SECRET: ACCESS_SECRET,
  };

  let allGood = true;
  for (const [name, val] of Object.entries(vars)) {
    if (!val) {
      console.log(`  ✗ ${name} — MISSING`);
      allGood = false;
    } else {
      console.log(`  ✓ ${name} — set (${val.slice(0, 6)}...)`);
    }
  }

  if (!allGood) {
    console.log("\n  ⚠ Some credentials are missing. Fix .env and re-run.\n");
    process.exit(1);
  }
  console.log("\n  All credentials present.\n");
}

async function checkAuth() {
  console.log("=== 2. AUTH CHECK (GET /2/users/me) ===\n");
  const url = "https://api.twitter.com/2/users/me";
  try {
    const res = await fetch(url, {
      headers: { Authorization: oauthHeader("GET", url) },
    });
    const body = await res.text();
    console.log(`  Status: ${res.status}`);
    console.log(`  Response: ${body}`);

    if (res.ok) {
      const data = JSON.parse(body);
      console.log(`\n  ✓ Authenticated as @${data.data?.username} (id: ${data.data?.id})\n`);
      return true;
    } else {
      console.log(`\n  ✗ Auth failed with ${res.status}. Check API Key and Access Token.\n`);
      return false;
    }
  } catch (err) {
    console.log(`  ✗ Request failed: ${err}\n`);
    return false;
  }
}

async function testPost() {
  console.log("=== 3. POST TEST (POST /2/tweets) ===\n");
  const url = "https://api.twitter.com/2/tweets";
  const text = `[Test] McAfee Report API check — ${new Date().toISOString().slice(0, 19)}Z`;
  console.log(`  Tweet text: "${text}"\n`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: oauthHeader("POST", url),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    const body = await res.text();
    console.log(`  Status: ${res.status}`);
    console.log(`  Response: ${body}`);

    if (res.ok) {
      const data = JSON.parse(body);
      console.log(`\n  ✓ Tweet posted! ID: ${data.data?.id}`);
      console.log(`    https://x.com/TheMcAfeeReport/status/${data.data?.id}\n`);
    } else if (res.status === 403) {
      console.log(`\n  ✗ 403 Forbidden — the app does NOT have write permission.`);
      console.log(`    → Go to developer.x.com → Your App → Settings → User authentication`);
      console.log(`    → Set "App permissions" to "Read and Write"`);
      console.log(`    → Then REGENERATE Access Token & Secret`);
      console.log(`    → Update .env and restart\n`);
    } else if (res.status === 401) {
      console.log(`\n  ✗ 401 Unauthorized — credentials are invalid or expired.`);
      console.log(`    → Regenerate all keys in the Developer Portal\n`);
    } else if (res.status === 429) {
      console.log(`\n  ✗ 429 Rate Limited — you've hit the tweet cap.`);
      console.log(`    → Free tier: 1,500 tweets/month. Wait and try again.\n`);
    } else {
      console.log(`\n  ✗ Unexpected error ${res.status}. See response above.\n`);
    }
  } catch (err) {
    console.log(`  ✗ Request failed: ${err}\n`);
  }
}

// ── main ─────────────────────────────────────────────────

async function main() {
  const shouldPost = process.argv.includes("--post");

  console.log("╔══════════════════════════════════════════╗");
  console.log("║    Twitter API Diagnostic for McAfee     ║");
  console.log("╚══════════════════════════════════════════╝");

  await checkEnv();
  const authOk = await checkAuth();

  if (!authOk) {
    console.log("Stopping — fix auth first.\n");
    process.exit(1);
  }

  if (shouldPost) {
    await testPost();
  } else {
    console.log("=== 3. POST TEST — SKIPPED ===\n");
    console.log("  Run with --post flag to actually post a test tweet:");
    console.log("  npx tsx scripts/test-twitter.ts --post\n");
  }
}

main();
