import { config } from "dotenv";
import path from "path";

// Load environment variables from .env.local
// Try multiple possible paths
const envPaths = [
  path.join(process.cwd(), ".env.local"),
  path.join(__dirname, "..", ".env.local"),
  ".env.local",
];

let envLoaded = false;
for (const envPath of envPaths) {
  const result = config({ path: envPath });
  if (!result.error) {
    envLoaded = true;
    console.log(`✅ Loaded environment from: ${envPath}`);
    break;
  }
}

if (!envLoaded) {
  console.warn("⚠️  Could not load .env.local, trying default .env");
  config(); // Try default .env
}

import { Bot, Context, session, SessionFlavor, InlineKeyboard } from "grammy";
import OpenAI from "openai";
import { PublicKey } from "@solana/web3.js";
import { safeFetchText, isUrlSafe, sanitizeForPrompt } from "../lib/url-validator";
import {
  isWhitelisted,
  addToWhitelist,
  removeFromWhitelist,
  getWhitelist,
  getAllHeadlines,
  removeHeadline,
  createSubmission,
  getSubmissionsByUser,
  getPendingSubmissionsCount,
  detectContentType,
  getRecentSubmissionCountByUser,
  getRecentSubmissionByUrl,
} from "../lib/db";

// Session data interface
interface SessionData {
  step: "idle" | "awaiting_url" | "awaiting_headline_choice" | "awaiting_image_choice" | "awaiting_column" | "awaiting_main_url" | "awaiting_main_headline_choice" | "awaiting_main_image_choice" | "awaiting_main_subtitle" | "awaiting_submit_url" | "awaiting_sol_address" | "awaiting_cotd_url" | "awaiting_cotd_headline_choice" | "awaiting_cotd_image_choice" | "awaiting_cotd_description";
  pendingUrl?: string;
  pendingTitle?: string;
  pendingColumn?: "left" | "right";
  pendingImageUrl?: string;
  includeImage?: boolean;
  generatedHeadlines?: string[];
  pendingSolAddress?: string;
}

type MyContext = Context & SessionFlavor<SessionData>;

// Environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const API_SECRET = process.env.API_SECRET_KEY;
const ADMIN_IDS = (process.env.ADMIN_TELEGRAM_IDS || "").split(",").filter(Boolean);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!BOT_TOKEN) {
  console.error("❌ TELEGRAM_BOT_TOKEN is required");
  process.exit(1);
}

if (!API_SECRET) {
  console.error("❌ API_SECRET_KEY is required");
  process.exit(1);
}

if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY is required");
  process.exit(1);
}

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

// Create bot instance
const bot = new Bot<MyContext>(BOT_TOKEN);

// Session middleware
bot.use(
  session({
    initial: (): SessionData => ({
      step: "idle",
    }),
  })
);

// Helper: Check if user is admin
function isAdmin(userId: number): boolean {
  return ADMIN_IDS.includes(userId.toString());
}

// Helper: Check authorization (whitelist or admin)
function isAuthorized(userId: number): boolean {
  return isAdmin(userId) || isWhitelisted(userId.toString());
}

// Helper: Escape Markdown special characters
function escapeMarkdown(text: string): string {
  return text.replace(/([_*`\[\]])/g, '\\$1');
}

// Helper: Make API request
async function apiRequest(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: object
): Promise<Response> {
  const url = `${API_URL}/api${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_SECRET!,
    },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  return fetch(url, options);
}

// Helper: Validate Solana address using the actual PublicKey constructor
function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// Helper: Check if URL is a YouTube link
function isYouTubeUrl(url: string): boolean {
  return url.includes("youtube.com") || url.includes("youtu.be");
}

// Helper: Extract YouTube video ID from URL
function getYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Helper: Fetch YouTube video info using oEmbed API (with safe fetch)
async function fetchYouTubeContent(url: string): Promise<{ title: string; description: string; content: string; imageUrl: string | null }> {
  const videoId = getYouTubeVideoId(url);
  
  try {
    // Use YouTube oEmbed to get basic info
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const oembedText = await safeFetchText(oembedUrl, { timeoutMs: 5_000 });
    const oembedData = JSON.parse(oembedText);
    
    // Also fetch the page to get the description
    const html = await safeFetchText(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      timeoutMs: 10_000,
    });
    
    // Extract description from meta tags
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i) ||
                        html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const description = ogDescMatch ? ogDescMatch[1].trim() : "";
    
    // Get thumbnail
    const imageUrl = videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : oembedData.thumbnail_url || null;
    
    return {
      title: oembedData.title || "",
      description: description,
      content: description,
      imageUrl,
    };
  } catch (error) {
    console.error("Error fetching YouTube content:", error);
    return fetchRegularPageContent(url);
  }
}

// Browser-like headers to avoid bot blocking by major news sites
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Sec-Ch-Ua":
    '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

// Facebook's link preview crawler — sites MUST serve content to this for social sharing
const SOCIAL_CRAWLER_HEADERS: Record<string, string> = {
  "User-Agent":
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
};

// Garbage titles that indicate we got an error page instead of the article
const GARBAGE_TITLE_PATTERNS = [
  /^google($|\s*search)/i,
  /^yahoo($|\s*$)/i,
  /^access\s*denied/i,
  /^403\s*forbidden/i,
  /^404/i,
  /^error/i,
  /^just\s*a\s*moment/i,
  /^attention\s*required/i,
  /^blocked/i,
  /^verify\s*(you\s*are\s*)?human/i,
  /^oops/i,
  /^something\s*went\s*wrong/i,
  /^sign\s*in/i,
  /^page\s*not\s*found/i,
];

function isBotGarbageTitle(title: string): boolean {
  if (!title || title.length < 10) return true;
  return GARBAGE_TITLE_PATTERNS.some((p) => p.test(title.trim()));
}

// Helper: Extract content from HTML (shared between direct fetch and fallbacks)
/** Decode HTML entities (named, decimal &#39;, and hex &#x27;). */
function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"',
    "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&mdash;": "—",
    "&ndash;": "–", "&lsquo;": "\u2018", "&rsquo;": "\u2019",
    "&ldquo;": "\u201C", "&rdquo;": "\u201D", "&hellip;": "…",
  };
  return text.replace(/&[^;]+;/g, (m) => {
    if (named[m]) return named[m];
    const hex = m.match(/^&#x([0-9a-fA-F]+);$/);
    if (hex) { const c = parseInt(hex[1], 16); if (c > 0 && c <= 0x10ffff) return String.fromCodePoint(c); }
    const dec = m.match(/^&#(\d+);$/);
    if (dec) { const c = parseInt(dec[1], 10); if (c > 0 && c <= 0x10ffff) return String.fromCodePoint(c); }
    return m;
  });
}

function extractFromHtml(html: string): { title: string; description: string; content: string; imageUrl: string | null } {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1].trim()) : "";

  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  const description = descMatch ? decodeEntities(descMatch[1].trim()) : "";

  const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  const ogTitle = ogTitleMatch ? decodeEntities(ogTitleMatch[1].trim()) : "";

  const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
  const ogDescription = ogDescMatch ? decodeEntities(ogDescMatch[1].trim()) : "";

  const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                       html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
  let imageUrl = ogImageMatch ? ogImageMatch[1].trim() : null;

  if (!imageUrl) {
    const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                              html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
    imageUrl = twitterImageMatch ? twitterImageMatch[1].trim() : null;
  }

  // JSON-LD structured data
  let ldTitle = "";
  let ldDescription = "";
  let ldContent = "";
  let ldImage: string | null = null;

  const jsonLdBlocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of jsonLdBlocks) {
    try {
      const ld = JSON.parse(match[1].trim());
      const items = Array.isArray(ld) ? ld : [ld];
      for (const item of items) {
        const itemType = item["@type"] || "";
        const isArticle = /article|newsarticle|webpage|blogposting/i.test(
          Array.isArray(itemType) ? itemType.join(" ") : itemType
        );
        if (isArticle || item.headline) {
          ldTitle = ldTitle || item.headline || item.name || "";
          ldDescription = ldDescription || item.description || item.abstract || "";
          ldContent = ldContent || item.articleBody || item.text || "";
          if (!ldImage) {
            if (typeof item.image === "string") ldImage = item.image;
            else if (item.image?.url) ldImage = item.image.url;
            else if (Array.isArray(item.image) && item.image[0]) {
              ldImage = typeof item.image[0] === "string" ? item.image[0] : item.image[0]?.url || null;
            }
          }
        }
      }
    } catch { /* malformed JSON-LD */ }
  }

  const paragraphMatch = html.match(/<p[^>]*>([^<]{50,500})<\/p>/i);
  const paragraphText = paragraphMatch ? paragraphMatch[1].replace(/<[^>]+>/g, "").trim() : "";

  return {
    title: ogTitle || ldTitle || title,
    description: ogDescription || ldDescription || description,
    content: ldContent?.substring(0, 1000) || paragraphText,
    imageUrl: imageUrl || ldImage,
  };
}

// Helper: Fetch regular page content with multiple fallback strategies
async function fetchRegularPageContent(url: string): Promise<{ title: string; description: string; content: string; imageUrl: string | null }> {
  // Attempt 1: Direct fetch with browser headers
  try {
    const html = await safeFetchText(url, { headers: BROWSER_HEADERS, timeoutMs: 15_000 });
    const result = extractFromHtml(html);
    if (!isBotGarbageTitle(result.title)) {
      return result;
    }
    console.warn(`[Bot] Direct fetch returned garbage for ${url}: "${result.title}"`);
  } catch (error) {
    console.warn(`[Bot] Direct fetch failed for ${url}:`, error);
  }

  // Attempt 2: Social media crawler (most reliable — sites serve content to Facebook's crawler)
  try {
    console.log(`[Bot] Trying social media crawler for ${url}`);
    const html = await safeFetchText(url, { headers: SOCIAL_CRAWLER_HEADERS, timeoutMs: 15_000 });
    const result = extractFromHtml(html);
    if (!isBotGarbageTitle(result.title)) {
      console.log(`[Bot] Social crawler hit for ${url}: "${result.title}"`);
      return result;
    }
    console.warn(`[Bot] Social crawler returned garbage for ${url}: "${result.title}"`);
  } catch (error) {
    console.warn(`[Bot] Social crawler failed for ${url}:`, error);
  }

  // Attempt 3: Google webcache
  try {
    const cacheUrl = `https://webcache.googleusercontent.com/search?q=cache:${url}&strip=1`;
    console.log(`[Bot] Trying webcache for ${url}`);
    const html = await safeFetchText(cacheUrl, { headers: BROWSER_HEADERS, timeoutMs: 10_000 });
    const result = extractFromHtml(html);
    if (!isBotGarbageTitle(result.title)) {
      console.log(`[Bot] Webcache hit for ${url}: "${result.title}"`);
      return result;
    }
    console.warn(`[Bot] Webcache returned garbage for ${url}: "${result.title}"`);
  } catch (error) {
    console.warn(`[Bot] Webcache failed for ${url}:`, error);
  }

  console.error(`[Bot] All fetch strategies failed for ${url}`);
  return { title: "", description: "", content: "", imageUrl: null };
}

// Helper: Check if URL is a Twitter/X link
function isTwitterUrl(url: string): boolean {
  return url.includes("twitter.com") || url.includes("x.com");
}

// Helper: Check if URL is a TikTok link
function isTikTokUrl(url: string): boolean {
  return url.includes("tiktok.com");
}

// Helper: Fetch Twitter/X content using oEmbed API (with safe fetch)
async function fetchTwitterContent(url: string): Promise<{ title: string; description: string; content: string; imageUrl: string | null }> {
  try {
    // Normalize x.com → twitter.com for oEmbed compatibility
    const normalizedUrl = url.replace(
      /^(https?:\/\/)(?:x\.com|twitter\.com)/i,
      "$1twitter.com"
    );

    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(normalizedUrl)}&omit_script=true`;
    const oembedText = await safeFetchText(oembedUrl, { timeoutMs: 8_000 });
    const oembedData = JSON.parse(oembedText);

    // Extract plain text from the HTML snippet
    const tweetHtml: string = oembedData.html || "";
    const tweetText = tweetHtml
      .replace(/<blockquote[^>]*>/gi, "")
      .replace(/<\/blockquote>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<a[^>]*>(.*?)<\/a>/gi, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/&mdash;/g, "—")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ")
      .trim();

    const authorName: string = oembedData.author_name || "";
    const authorHandle: string = oembedData.author_url
      ? oembedData.author_url.replace(/^https?:\/\/(twitter|x)\.com\//i, "@")
      : "";

    const title = authorHandle
      ? `${authorName} (${authorHandle})`
      : authorName || "Tweet";

    // Try to get OG image from the page
    let imageUrl: string | null = null;
    try {
      const pageContent = await fetchRegularPageContent(url);
      imageUrl = pageContent.imageUrl;
    } catch {
      // Best-effort
    }

    return {
      title,
      description: tweetText.substring(0, 300),
      content: tweetText,
      imageUrl,
    };
  } catch (error) {
    console.error("Error fetching Twitter content via oEmbed:", error);
    return fetchRegularPageContent(url);
  }
}

// Helper: Fetch TikTok content using oEmbed API (with safe fetch)
async function fetchTikTokContent(url: string): Promise<{ title: string; description: string; content: string; imageUrl: string | null }> {
  try {
    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    const oembedText = await safeFetchText(oembedUrl, { timeoutMs: 8_000 });
    const oembedData = JSON.parse(oembedText);

    const title = oembedData.title || oembedData.author_name || "TikTok Video";
    const authorName: string = oembedData.author_name || "";
    const authorHandle: string = oembedData.author_unique_id
      ? `@${oembedData.author_unique_id}`
      : "";

    const description = authorHandle
      ? `${authorName} (${authorHandle}): ${title}`
      : `${authorName}: ${title}`;

    return {
      title,
      description: description.substring(0, 300),
      content: title,
      imageUrl: oembedData.thumbnail_url || null,
    };
  } catch (error) {
    console.error("Error fetching TikTok content via oEmbed:", error);
    return fetchRegularPageContent(url);
  }
}

async function fetchPageContent(url: string): Promise<{ title: string; description: string; content: string; imageUrl: string | null }> {
  // Use platform-specific fetching
  if (isYouTubeUrl(url)) {
    return fetchYouTubeContent(url);
  }
  if (isTwitterUrl(url)) {
    return fetchTwitterContent(url);
  }
  if (isTikTokUrl(url)) {
    return fetchTikTokContent(url);
  }
  return fetchRegularPageContent(url);
}

// Helper: Generate headlines using OpenAI
async function generateHeadlines(url: string, pageData: { title: string; description: string; content: string }): Promise<string[]> {
  const prompt = `You are John McAfee's AI headline writer for The McAfee Report — a Drudge Report-style crypto news aggregator. Write headlines like McAfee would: provocative, irreverent, anti-establishment, darkly funny, and always cutting to the truth they don't want you to see.

Based on the following article information, generate 3 different punchy, McAfee-style headline options.

URL: ${url}
Original Title: ${sanitizeForPrompt(pageData.title, 200)}
Description: ${sanitizeForPrompt(pageData.description, 300)}
Content Preview: ${sanitizeForPrompt(pageData.content, 500)}

Requirements:
- Headlines should be concise (under 80 characters)
- Channel McAfee: bold, paranoid, freedom-obsessed, darkly humorous
- Use active voice and strong verbs — make it feel URGENT
- If it's about government/regulation, lean into the anti-authority angle
- If it's about crypto/markets, make it feel like insider knowledge
- ALL CAPS is acceptable for emphasis on key words (like Drudge Report)
- Make the reader think "holy shit, I need to click this"

Return ONLY the 3 headlines, one per line, numbered 1-3. No other text.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 300,
    });

    const response = completion.choices[0]?.message?.content || "";
    
    // Parse the numbered headlines
    const lines = response.split("\n").filter(line => line.trim());
    const headlines = lines
      .map(line => line.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter(h => h.length > 0)
      .slice(0, 3);

    // Fallback to original title if AI fails
    if (headlines.length === 0 && pageData.title) {
      return [pageData.title];
    }

    return headlines;
  } catch (error) {
    console.error("Error generating headlines:", error);
    // Fallback to original title
    if (pageData.title) {
      return [pageData.title];
    }
    return ["[Could not generate headline - please enter manually]"];
  }
}

// Helper: Generate Coin Of The Day title options using OpenAI
async function generateCotdHeadlines(url: string, pageData: { title: string; description: string; content: string }): Promise<string[]> {
  const prompt = `You are writing the "Coin Of The Day" feature title for The McAfee Report — a crypto news aggregator. This highlights a single crypto project each day.

Based on the following project page, generate 3 short, punchy title options for the featured coin/project.

URL: ${url}
Original Title: ${sanitizeForPrompt(pageData.title, 200)}
Description: ${sanitizeForPrompt(pageData.description, 300)}
Content Preview: ${sanitizeForPrompt(pageData.content, 500)}

Requirements:
- Keep titles concise (under 60 characters)
- Make the project sound interesting and worth checking out
- Use the project/coin name if identifiable
- Be hype but not misleading
- ALL CAPS is acceptable for emphasis

Return ONLY the 3 titles, one per line, numbered 1-3. No other text.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 200,
    });

    const response = completion.choices[0]?.message?.content || "";
    const lines = response.split("\n").filter(line => line.trim());
    const headlines = lines
      .map(line => line.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter(h => h.length > 0)
      .slice(0, 3);

    if (headlines.length === 0 && pageData.title) {
      return [pageData.title];
    }

    return headlines;
  } catch (error) {
    console.error("Error generating COTD headlines:", error);
    if (pageData.title) {
      return [pageData.title];
    }
    return ["[Could not generate title - please enter manually]"];
  }
}

// Helper: Reset session
function resetSession(session: SessionData) {
  session.step = "idle";
  session.pendingUrl = undefined;
  session.pendingTitle = undefined;
  session.pendingColumn = undefined;
  session.pendingImageUrl = undefined;
  session.includeImage = undefined;
  session.generatedHeadlines = undefined;
  session.pendingSolAddress = undefined;
}

// Helper: Get content type emoji
function getContentTypeEmoji(contentType: string): string {
  switch (contentType) {
    case "tweet": return "🐦";
    case "youtube": return "📺";
    case "tiktok": return "🎵";
    case "article": return "📰";
    default: return "🔗";
  }
}

// Command: /start
bot.command("start", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const authorized = isAuthorized(userId);
  const admin = isAdmin(userId);

  let message = `🌐 *THE MCAFEE REPORT Bot*\n\n`;
  
  // Public commands available to everyone
  message += `*Submit Breaking News:*\n`;
  message += `/submit - Submit a news link (earn rewards!)\n`;
  message += `/mystatus - Check your submission status\n\n`;
  
  if (authorized) {
    message += `You are ${admin ? "an *admin*" : "a *whitelisted editor*"}.\n\n`;
    message += `*Editor Commands:*\n`;
    message += `/add - Add a new headline (AI-generated)\n`;
    message += `/main - Set the main headline\n`;
    message += `/cotd - Set Coin Of The Day\n`;
    message += `/list - View recent headlines\n`;
    message += `/remove - Remove a headline\n`;
    
    if (admin) {
      message += `\n*Admin Commands:*\n`;
      message += `/whitelist - View whitelisted users\n`;
      message += `/adduser <id> - Add user to whitelist\n`;
      message += `/removeuser <id> - Remove user from whitelist\n`;
      message += `/queue - View submission queue\n`;
    }
  }
  
  message += `\n/help - Show all commands`;

  await ctx.reply(message, { parse_mode: "Markdown" });
});

// Command: /help
bot.command("help", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const authorized = isAuthorized(userId);
  const admin = isAdmin(userId);
  
  let message = `📖 *THE MCAFEE REPORT Bot Help*\n\n`;
  
  message += `*🌍 Public Commands (Everyone):*\n`;
  message += `/submit - Submit breaking news to earn rewards\n`;
  message += `  • Submit articles, tweets, YouTube, TikTok\n`;
  message += `  • If published, a token launches on pump.fun\n`;
  message += `  • 50% of creator fees go to YOU!\n`;
  message += `/mystatus - Check your submission history\n`;
  message += `/cancel - Cancel current operation\n`;

  if (authorized) {
    message += `\n*✏️ Editor Commands:*\n`;
    message += `/add - Send a URL and AI generates headline options\n`;
    message += `/main - Set the main/center headline\n`;
    message += `/cotd - Set Coin Of The Day (no pump.fun coin)\n`;
    message += `/list - View recent headlines with IDs\n`;
    message += `/remove <id> - Remove a headline by ID\n`;
  }

  if (admin) {
    message += `\n*👮 Admin Commands:*\n`;
    message += `/whitelist - View all whitelisted users\n`;
    message += `/adduser <telegram_id> [username] - Add to whitelist\n`;
    message += `/removeuser <telegram_id> - Remove from whitelist\n`;
    message += `/queue - View pending submissions queue\n`;
  }

  message += `\n*Website:* ${API_URL}`;

  await ctx.reply(message, { parse_mode: "Markdown" });
});

// Command: /add - Start adding headline flow
bot.command("add", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAuthorized(userId)) {
    await ctx.reply("⚠️ You are not authorized to use this bot.");
    return;
  }

  ctx.session.step = "awaiting_url";
  await ctx.reply(
    "📝 *Add New Headline*\n\nSend me the article URL and I'll generate headline options for you:",
    { parse_mode: "Markdown" }
  );
});

// Command: /main - Set main headline
bot.command("main", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAuthorized(userId)) {
    await ctx.reply("⚠️ You are not authorized to use this bot.");
    return;
  }

  ctx.session.step = "awaiting_main_url";
  await ctx.reply(
    "🎯 *Set Main Headline*\n\nSend me the article URL:",
    { parse_mode: "Markdown" }
  );
});

// Command: /cotd - Set coin of the day
bot.command("cotd", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAuthorized(userId)) {
    await ctx.reply("⚠️ You are not authorized to use this bot.");
    return;
  }

  ctx.session.step = "awaiting_cotd_url";
  await ctx.reply(
    "⭐ *Set Coin Of The Day*\n\nSend me the project URL (this link will NOT create a pump.fun coin):",
    { parse_mode: "Markdown" }
  );
});

// Command: /list - Show recent headlines
bot.command("list", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAuthorized(userId)) {
    await ctx.reply("⚠️ You are not authorized to use this bot.");
    return;
  }

  try {
    const headlines = getAllHeadlines(20);
    
    if (headlines.length === 0) {
      await ctx.reply("📭 No headlines found.");
      return;
    }

    let message = "📰 *Recent Headlines:*\n\n";
    for (const h of headlines) {
      const columnEmoji = h.column === "left" ? "◀️" : h.column === "right" ? "▶️" : "⭐";
      const imgEmoji = h.image_url ? "🖼️" : "";
      message += `${columnEmoji}${imgEmoji} \`${h.id}\` - ${h.title.substring(0, 35)}${h.title.length > 35 ? "..." : ""}\n`;
    }

    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error listing headlines:", error);
    await ctx.reply("❌ Failed to fetch headlines.");
  }
});

// Command: /remove - Remove a headline
bot.command("remove", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAuthorized(userId)) {
    await ctx.reply("⚠️ You are not authorized to use this bot.");
    return;
  }

  const args = ctx.message?.text?.split(" ").slice(1);
  if (!args || args.length === 0) {
    await ctx.reply(
      "Usage: `/remove <id>`\n\nUse `/list` to see headline IDs.",
      { parse_mode: "Markdown" }
    );
    return;
  }

  const id = parseInt(args[0], 10);
  if (isNaN(id)) {
    await ctx.reply("❌ Invalid ID. Please provide a number.");
    return;
  }

  try {
    const deleted = removeHeadline(id);
    if (deleted) {
      await ctx.reply(`✅ Headline #${id} has been removed.`);
    } else {
      await ctx.reply(`❌ Headline #${id} not found.`);
    }
  } catch (error) {
    console.error("Error removing headline:", error);
    await ctx.reply("❌ Failed to remove headline.");
  }
});

// Command: /cancel - Cancel current operation
bot.command("cancel", async (ctx) => {
  resetSession(ctx.session);
  await ctx.reply("❌ Operation cancelled.");
});

// ============= PUBLIC SUBMISSION COMMANDS =============

// Command: /submit - Start public submission flow (available to everyone)
bot.command("submit", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  ctx.session.step = "awaiting_submit_url";
  
  const pendingCount = getPendingSubmissionsCount();
  
  await ctx.reply(
    `🚀 *Submit Breaking News*\n\n` +
    `Submit a link to breaking news and earn rewards!\n\n` +
    `*How it works:*\n` +
    `1️⃣ Send me a news link (article, tweet, YouTube, TikTok)\n` +
    `2️⃣ Provide your Solana wallet address\n` +
    `3️⃣ Our AI reviews your submission\n` +
    `4️⃣ If approved, a token launches on pump.fun!\n` +
    `5️⃣ You get 50% of creator fees 💰\n\n` +
    `*Requirements:*\n` +
    `• News must be real and verifiable\n` +
    `• Must be breaking (less than 2 hours old)\n` +
    `• Must not be a duplicate\n\n` +
    `📊 Current queue: ${pendingCount} submissions\n\n` +
    `Send me the URL now:`,
    { parse_mode: "Markdown" }
  );
});

// Command: /mystatus - Check submission status
bot.command("mystatus", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  try {
    const submissions = getSubmissionsByUser(userId.toString(), 10);
    
    if (submissions.length === 0) {
      await ctx.reply(
        `📭 *No submissions yet*\n\n` +
        `Use /submit to submit your first breaking news link!`,
        { parse_mode: "Markdown" }
      );
      return;
    }

    let message = `📊 *Your Recent Submissions:*\n\n`;
    
    for (const sub of submissions) {
      const emoji = getContentTypeEmoji(sub.content_type);
      const statusEmoji = {
        pending: "⏳",
        validating: "🔍",
        approved: "✅",
        rejected: "❌",
        published: "🎉",
      }[sub.status] || "❓";
      
      const shortUrl = sub.url.length > 30 ? sub.url.substring(0, 30) + "..." : sub.url;
      
      message += `${emoji} ${statusEmoji} \`#${sub.id}\`\n`;
      message += `   \`${shortUrl}\`\n`;
      message += `   Status: *${sub.status}*`;
      if (sub.rejection_reason) {
        message += ` - ${sub.rejection_reason}`;
      }
      message += `\n\n`;
    }

    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error fetching submissions:", error);
    await ctx.reply("❌ Failed to fetch your submissions. Please try again.");
  }
});

// Admin Command: /queue - View pending submissions
bot.command("queue", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply("⚠️ This command is only available to admins.");
    return;
  }

  try {
    const { getSubmissionsByStatus } = await import("../lib/db");
    const pending = getSubmissionsByStatus("pending", 20);
    const validating = getSubmissionsByStatus("validating", 10);
    const approved = getSubmissionsByStatus("approved", 10);
    
    let message = `📋 *Submission Queue*\n\n`;
    
    message += `*Pending (${pending.length}):*\n`;
    if (pending.length === 0) {
      message += `  No pending submissions\n`;
    } else {
      for (const sub of pending.slice(0, 5)) {
        const emoji = getContentTypeEmoji(sub.content_type);
        message += `  ${emoji} \`#${sub.id}\` - \`${sub.url.substring(0, 25)}...\`\n`;
      }
      if (pending.length > 5) {
        message += `  ... and ${pending.length - 5} more\n`;
      }
    }
    
    message += `\n*Validating (${validating.length}):*\n`;
    if (validating.length === 0) {
      message += `  None currently validating\n`;
    } else {
      for (const sub of validating.slice(0, 3)) {
        message += `  🔍 \`#${sub.id}\` - \`${sub.url.substring(0, 25)}...\`\n`;
      }
    }
    
    message += `\n*Approved & Waiting (${approved.length}):*\n`;
    if (approved.length === 0) {
      message += `  No approved submissions waiting\n`;
    } else {
      for (const sub of approved.slice(0, 3)) {
        message += `  ✅ \`#${sub.id}\` - \`${sub.url.substring(0, 25)}...\`\n`;
      }
    }

    await ctx.reply(message, { parse_mode: "Markdown" });
  } catch (error) {
    console.error("Error fetching queue:", error);
    await ctx.reply("❌ Failed to fetch submission queue.");
  }
});

// Admin Command: /whitelist
bot.command("whitelist", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply("⚠️ This command is only available to admins.");
    return;
  }

  const users = getWhitelist();
  
  if (users.length === 0) {
    await ctx.reply("📭 No whitelisted users.");
    return;
  }

  let message = "👥 *Whitelisted Users:*\n\n";
  for (const user of users) {
    message += `• \`${user.telegram_id}\`${user.username ? ` (@${user.username})` : ""}\n`;
  }

  await ctx.reply(message, { parse_mode: "Markdown" });
});

// Admin Command: /adduser
bot.command("adduser", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply("⚠️ This command is only available to admins.");
    return;
  }

  const args = ctx.message?.text?.split(" ").slice(1);
  if (!args || args.length === 0) {
    await ctx.reply("Usage: `/adduser <telegram_id> [username]`", {
      parse_mode: "Markdown",
    });
    return;
  }

  const telegramId = args[0];
  const username = args[1];

  try {
    addToWhitelist(telegramId, username);
    await ctx.reply(`✅ User \`${telegramId}\` has been added to the whitelist.`, {
      parse_mode: "Markdown",
    });
  } catch (error) {
    console.error("Error adding to whitelist:", error);
    await ctx.reply("❌ Failed to add user to whitelist.");
  }
});

// Admin Command: /removeuser
bot.command("removeuser", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAdmin(userId)) {
    await ctx.reply("⚠️ This command is only available to admins.");
    return;
  }

  const args = ctx.message?.text?.split(" ").slice(1);
  if (!args || args.length === 0) {
    await ctx.reply("Usage: `/removeuser <telegram_id>`", {
      parse_mode: "Markdown",
    });
    return;
  }

  const telegramId = args[0];

  try {
    const removed = removeFromWhitelist(telegramId);
    if (removed) {
      await ctx.reply(`✅ User \`${telegramId}\` has been removed from the whitelist.`, {
        parse_mode: "Markdown",
      });
    } else {
      await ctx.reply(`❌ User \`${telegramId}\` not found in whitelist.`);
    }
  } catch (error) {
    console.error("Error removing from whitelist:", error);
    await ctx.reply("❌ Failed to remove user from whitelist.");
  }
});

// Handle text messages for interactive flows
bot.on("message:text", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const text = ctx.message.text;
  const session = ctx.session;

  // ============= PUBLIC SUBMISSION FLOW =============

  if (session.step === "awaiting_submit_url") {
    // Validate URL format
    try {
      new URL(text);
    } catch {
      await ctx.reply("❌ Invalid URL. Please send a valid URL:");
      return;
    }

    // SSRF check – reject URLs pointing to internal/private resources
    const urlCheck = isUrlSafe(text);
    if (!urlCheck.safe) {
      await ctx.reply(`❌ URL not allowed: ${urlCheck.reason}`);
      return;
    }

    session.pendingUrl = text;
    session.step = "awaiting_sol_address";
    
    const contentType = detectContentType(text);
    const emoji = getContentTypeEmoji(contentType);
    
    await ctx.reply(
      `${emoji} *Link received!*\n\n` +
      `Type: ${contentType}\n` +
      `URL: \`${text.substring(0, 50)}${text.length > 50 ? "..." : ""}\`\n\n` +
      `Now send me your *Solana wallet address* to receive rewards:`,
      { parse_mode: "Markdown" }
    );
    return;
  }

  if (session.step === "awaiting_sol_address") {
    // Validate Solana address
    if (!isValidSolanaAddress(text)) {
      await ctx.reply(
        "❌ Invalid Solana address.\n\n" +
        "Please send a valid Solana wallet address (32-44 characters, base58 encoded):"
      );
      return;
    }

    session.pendingSolAddress = text;
    
    // Rate limiting: max 5 submissions per hour per user
    const recentCount = getRecentSubmissionCountByUser(userId.toString(), 1);
    if (recentCount >= 5) {
      await ctx.reply(
        "⏳ *Rate limit reached*\n\n" +
        "You can submit up to 5 links per hour. Please wait and try again.",
        { parse_mode: "Markdown" }
      );
      resetSession(session);
      return;
    }

    // URL duplicate check – reject if same URL was recently submitted
    const existingSubmission = getRecentSubmissionByUrl(session.pendingUrl!, 48);
    if (existingSubmission) {
      await ctx.reply(
        `❌ This URL was already submitted recently (Submission #${existingSubmission.id}).\n\n` +
        "Please submit a different link."
      );
      resetSession(session);
      return;
    }

    // Create the submission
    try {
      const contentType = detectContentType(session.pendingUrl!);
      const submission = createSubmission(
        userId.toString(),
        text,
        session.pendingUrl!,
        contentType,
        ctx.from?.username
      );
      
      const pendingCount = getPendingSubmissionsCount();
      
      await ctx.reply(
        `✅ *Submission received!*\n\n` +
        `📋 Submission ID: \`#${submission.id}\`\n` +
        `🔗 URL: \`${session.pendingUrl!.substring(0, 40)}...\`\n` +
        `💰 Rewards to: \`${text.substring(0, 8)}...${text.substring(text.length - 4)}\`\n\n` +
        `*What happens next:*\n` +
        `1️⃣ Our AI will analyze your submission\n` +
        `2️⃣ If approved, it enters the publishing queue\n` +
        `3️⃣ When published, a token launches!\n` +
        `4️⃣ You'll receive 50% of creator fees\n\n` +
        `📊 Queue position: ~${pendingCount}\n\n` +
        `Use /mystatus to check your submission status.`,
        { parse_mode: "Markdown" }
      );
      
      // Notify admins of new submission
      for (const adminId of ADMIN_IDS) {
        try {
          await bot.api.sendMessage(
            adminId,
            `🆕 *New Submission*\n\n` +
            `ID: \`#${submission.id}\`\n` +
            `From: ${ctx.from?.username ? `@${ctx.from.username}` : userId}\n` +
            `Type: ${contentType}\n` +
            `URL: \`${session.pendingUrl!.substring(0, 50)}...\``,
            { parse_mode: "Markdown" }
          );
        } catch {
          // Admin might have blocked the bot
        }
      }
    } catch (error) {
      console.error("Error creating submission:", error);
      await ctx.reply("❌ Failed to create submission. Please try again with /submit");
    }
    
    resetSession(session);
    return;
  }

  // ============= EDITOR FLOWS (require authorization) =============

  if (!isAuthorized(userId)) {
    return;
  }

  // Handle /skip command for COTD description step
  if (text === "/skip" && session.step === "awaiting_cotd_description") {
    try {
      const response = await apiRequest("/coin-of-the-day", "PUT", {
        title: session.pendingTitle,
        url: session.pendingUrl,
        image_url: session.includeImage ? session.pendingImageUrl : undefined,
      });

      if (response.ok) {
        await ctx.reply(
          `✅ *Coin Of The Day updated!*\n\n` +
          `⭐ ${escapeMarkdown(session.pendingTitle || "")}\n` +
          `🔗 \`${session.pendingUrl || ""}\`\n` +
          `${session.includeImage ? "🖼️ With image\n" : ""}` +
          `\n_No pump.fun coin will be created._\n` +
          `\nView it at: ${API_URL}`,
          { parse_mode: "Markdown" }
        );
      } else {
        const error = await response.json();
        throw new Error(error.error || "Unknown error");
      }
    } catch (error) {
      console.error("Error setting coin of the day:", error);
      await ctx.reply("❌ Failed to set Coin Of The Day. Please try again.");
    }

    resetSession(session);
    return;
  }

  // Handle /skip command for subtitle step
  if (text === "/skip" && session.step === "awaiting_main_subtitle") {
    const subtitle = undefined;
    
    try {
      const response = await apiRequest("/main-headline", "PUT", {
        title: session.pendingTitle,
        url: session.pendingUrl,
        subtitle,
        image_url: session.includeImage ? session.pendingImageUrl : undefined,
      });

      if (response.ok) {
        await ctx.reply(
          `✅ *Main headline updated!*\n\n` +
          `📰 ${escapeMarkdown(session.pendingTitle || "")}\n` +
          `🔗 \`${session.pendingUrl || ""}\`\n` +
          `${session.includeImage ? "🖼️ With thumbnail\n" : ""}` +
          `\nView it at: ${API_URL}`,
          { parse_mode: "Markdown" }
        );
      } else {
        const error = await response.json();
        throw new Error(error.error || "Unknown error");
      }
    } catch (error) {
      console.error("Error setting main headline:", error);
      await ctx.reply("❌ Failed to set main headline. Please try again.");
    }

    // Reset session
    resetSession(session);
    return;
  }

  // Skip if it's any other command
  if (text.startsWith("/")) {
    return;
  }

  switch (session.step) {
    // Adding regular headline flow - receive URL
    case "awaiting_url": {
      // Validate URL
      try {
        new URL(text);
      } catch {
        await ctx.reply("❌ Invalid URL. Please send a valid URL:");
        return;
      }

      session.pendingUrl = text;

      // Show loading message
      const loadingMsg = await ctx.reply("🔄 Fetching article and generating headlines...");

      try {
        // Fetch page content
        const pageData = await fetchPageContent(text);
        
        // Store image URL if found
        session.pendingImageUrl = pageData.imageUrl || undefined;
        
        // Generate headlines with AI
        const headlines = await generateHeadlines(text, pageData);
        session.generatedHeadlines = headlines;
        session.step = "awaiting_headline_choice";

        // Create keyboard with headline options
        const keyboard = new InlineKeyboard();
        headlines.forEach((_, index) => {
          keyboard.text(`${index + 1}`, `headline_${index}`).row();
        });
        keyboard.text("✏️ Write my own", "headline_custom");

        // Build message with numbered headlines
        let message = "🤖 *AI-Generated Headlines:*\n\n";
        headlines.forEach((headline, index) => {
          message += `*${index + 1}.* ${headline}\n\n`;
        });
        if (pageData.imageUrl) {
          message += `🖼️ _Thumbnail detected_\n\n`;
        }
        message += "Choose a headline or write your own:";

        await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, message, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      } catch (error) {
        console.error("Error generating headlines:", error);
        await ctx.api.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          "❌ Failed to generate headlines. Please try again or send a headline manually."
        );
        session.step = "idle";
      }
      break;
    }

    // Main headline flow - receive URL
    case "awaiting_main_url": {
      try {
        new URL(text);
      } catch {
        await ctx.reply("❌ Invalid URL. Please send a valid URL:");
        return;
      }

      session.pendingUrl = text;

      // Show loading message
      const loadingMsg = await ctx.reply("🔄 Fetching article and generating headlines...");

      try {
        // Fetch page content
        const pageData = await fetchPageContent(text);
        
        // Store image URL if found
        session.pendingImageUrl = pageData.imageUrl || undefined;
        
        // Generate headlines with AI
        const headlines = await generateHeadlines(text, pageData);
        session.generatedHeadlines = headlines;
        session.step = "awaiting_main_headline_choice";

        // Create keyboard with headline options
        const keyboard = new InlineKeyboard();
        headlines.forEach((_, index) => {
          keyboard.text(`${index + 1}`, `main_headline_${index}`).row();
        });
        keyboard.text("✏️ Write my own", "main_headline_custom");

        // Build message with numbered headlines
        let message = "🤖 *AI-Generated Headlines for Main Spot:*\n\n";
        headlines.forEach((headline, index) => {
          message += `*${index + 1}.* ${headline}\n\n`;
        });
        if (pageData.imageUrl) {
          message += `🖼️ _Thumbnail detected_\n\n`;
        }
        message += "Choose a headline or write your own:";

        await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, message, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      } catch (error) {
        console.error("Error generating headlines:", error);
        await ctx.api.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          "❌ Failed to generate headlines. Please try again."
        );
        session.step = "idle";
      }
      break;
    }

    // Custom headline entry for regular headlines
    case "awaiting_headline_choice": {
      session.pendingTitle = text;
      
      if (session.pendingImageUrl) {
        session.step = "awaiting_image_choice";
        
        const keyboard = new InlineKeyboard()
          .text("✅ Yes, include image", "image_yes")
          .text("❌ No image", "image_no");

        await ctx.reply(
          `✅ Headline set!\n\n📰 "${text}"\n\n🖼️ Include the article thumbnail?`,
          { reply_markup: keyboard }
        );
      } else {
        session.step = "awaiting_column";
        
        const keyboard = new InlineKeyboard()
          .text("◀️ Left Column", "column_left")
          .text("▶️ Right Column", "column_right");

        await ctx.reply(`✅ Headline set!\n\n📰 "${text}"\n\nChoose the column:`, {
          reply_markup: keyboard,
        });
      }
      break;
    }

    // Custom headline entry for main headline
    case "awaiting_main_headline_choice": {
      session.pendingTitle = text;
      
      if (session.pendingImageUrl) {
        session.step = "awaiting_main_image_choice";
        
        const keyboard = new InlineKeyboard()
          .text("✅ Yes, include image", "main_image_yes")
          .text("❌ No image", "main_image_no");

        await ctx.reply(
          `✅ Headline set!\n\n📰 "${text}"\n\n🖼️ Include the article thumbnail?`,
          { reply_markup: keyboard }
        );
      } else {
        session.step = "awaiting_main_subtitle";
        await ctx.reply(
          `✅ Headline set!\n\n📰 "${text}"\n\nSend a subtitle (or /skip to skip):`
        );
      }
      break;
    }

    case "awaiting_main_subtitle": {
      const subtitle = text === "/skip" ? undefined : text;
      
      try {
        const response = await apiRequest("/main-headline", "PUT", {
          title: session.pendingTitle,
          url: session.pendingUrl,
          subtitle,
          image_url: session.includeImage ? session.pendingImageUrl : undefined,
        });

        if (response.ok) {
          await ctx.reply(
            `✅ *Main headline updated!*\n\n` +
            `📰 ${escapeMarkdown(session.pendingTitle || "")}\n` +
            `🔗 \`${session.pendingUrl || ""}\`\n` +
            `${subtitle ? `📝 ${escapeMarkdown(subtitle)}\n` : ""}` +
            `${session.includeImage ? "🖼️ With thumbnail\n" : ""}` +
            `\nView it at: ${API_URL}`,
            { parse_mode: "Markdown" }
          );
        } else {
          const error = await response.json();
          throw new Error(error.error || "Unknown error");
        }
      } catch (error) {
        console.error("Error setting main headline:", error);
        await ctx.reply("❌ Failed to set main headline. Please try again.");
      }

      resetSession(session);
      break;
    }

    // ============= COIN OF THE DAY FLOW =============

    // COTD: receive URL
    case "awaiting_cotd_url": {
      try {
        new URL(text);
      } catch {
        await ctx.reply("❌ Invalid URL. Please send a valid URL:");
        return;
      }

      session.pendingUrl = text;

      const loadingMsg = await ctx.reply("🔄 Fetching project info and generating title...");

      try {
        const pageData = await fetchPageContent(text);
        
        session.pendingImageUrl = pageData.imageUrl || undefined;
        
        const headlines = await generateCotdHeadlines(text, pageData);
        session.generatedHeadlines = headlines;
        session.step = "awaiting_cotd_headline_choice";

        const keyboard = new InlineKeyboard();
        headlines.forEach((_, index) => {
          keyboard.text(`${index + 1}`, `cotd_headline_${index}`).row();
        });
        keyboard.text("✏️ Write my own", "cotd_headline_custom");

        let message = "⭐ *Coin Of The Day - Choose a Title:*\n\n";
        headlines.forEach((headline, index) => {
          message += `*${index + 1}.* ${headline}\n\n`;
        });
        if (pageData.imageUrl) {
          message += `🖼️ _Project image detected_\n\n`;
        }
        message += "Choose a title or write your own:";

        await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, message, {
          parse_mode: "Markdown",
          reply_markup: keyboard,
        });
      } catch (error) {
        console.error("Error generating COTD headlines:", error);
        await ctx.api.editMessageText(
          ctx.chat.id,
          loadingMsg.message_id,
          "❌ Failed to fetch project info. Please try again."
        );
        session.step = "idle";
      }
      break;
    }

    // COTD: custom title typed as text
    case "awaiting_cotd_headline_choice": {
      session.pendingTitle = text;
      
      if (session.pendingImageUrl) {
        session.step = "awaiting_cotd_image_choice";
        
        const keyboard = new InlineKeyboard()
          .text("✅ Yes, include image", "cotd_image_yes")
          .text("❌ No image", "cotd_image_no");

        await ctx.reply(
          `✅ Title set!\n\n⭐ "${text}"\n\n🖼️ Include the project image?`,
          { reply_markup: keyboard }
        );
      } else {
        session.step = "awaiting_cotd_description";
        await ctx.reply(
          `✅ Title set!\n\n⭐ "${text}"\n\nSend a short description (or /skip to skip):`
        );
      }
      break;
    }

    // COTD: description
    case "awaiting_cotd_description": {
      const description = text === "/skip" ? undefined : text;
      
      try {
        const response = await apiRequest("/coin-of-the-day", "PUT", {
          title: session.pendingTitle,
          url: session.pendingUrl,
          description,
          image_url: session.includeImage ? session.pendingImageUrl : undefined,
        });

        if (response.ok) {
          await ctx.reply(
            `✅ *Coin Of The Day updated!*\n\n` +
            `⭐ ${escapeMarkdown(session.pendingTitle || "")}\n` +
            `🔗 \`${session.pendingUrl || ""}\`\n` +
            `${description ? `📝 ${escapeMarkdown(description)}\n` : ""}` +
            `${session.includeImage ? "🖼️ With image\n" : ""}` +
            `\n_No pump.fun coin will be created._\n` +
            `\nView it at: ${API_URL}`,
            { parse_mode: "Markdown" }
          );
        } else {
          const error = await response.json();
          throw new Error(error.error || "Unknown error");
        }
      } catch (error) {
        console.error("Error setting coin of the day:", error);
        await ctx.reply("❌ Failed to set Coin Of The Day. Please try again.");
      }

      resetSession(session);
      break;
    }

    default:
      break;
  }
});

// Handle callback queries (button clicks)
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const session = ctx.session;

  // Verify the user is still authorized before processing editor callbacks
  if (!ctx.from || !isAuthorized(ctx.from.id)) {
    await ctx.answerCallbackQuery({ text: "You are not authorized." });
    return;
  }

  // Handle headline selection for regular headlines
  if (data.startsWith("headline_")) {
    if (data === "headline_custom") {
      await ctx.editMessageText("✏️ Send me your custom headline:");
      await ctx.answerCallbackQuery();
      return;
    }

    const index = parseInt(data.replace("headline_", ""), 10);
    const selectedHeadline = session.generatedHeadlines?.[index];

    if (selectedHeadline) {
      session.pendingTitle = selectedHeadline;
      
      if (session.pendingImageUrl) {
        session.step = "awaiting_image_choice";
        
        const keyboard = new InlineKeyboard()
          .text("✅ Yes, include image", "image_yes")
          .text("❌ No image", "image_no");

        await ctx.editMessageText(
          `✅ Headline selected!\n\n📰 "${selectedHeadline}"\n\n🖼️ Include the article thumbnail?`,
          { reply_markup: keyboard }
        );
      } else {
        session.step = "awaiting_column";

        const keyboard = new InlineKeyboard()
          .text("◀️ Left Column", "column_left")
          .text("▶️ Right Column", "column_right");

        await ctx.editMessageText(
          `✅ Headline selected!\n\n📰 "${selectedHeadline}"\n\nChoose the column:`,
          { reply_markup: keyboard }
        );
      }
    }
    await ctx.answerCallbackQuery();
    return;
  }

  // Handle image choice for regular headlines
  if (data === "image_yes" || data === "image_no") {
    session.includeImage = data === "image_yes";
    session.step = "awaiting_column";

    const keyboard = new InlineKeyboard()
      .text("◀️ Left Column", "column_left")
      .text("▶️ Right Column", "column_right");

    await ctx.editMessageText(
      `✅ ${data === "image_yes" ? "Image will be included!" : "No image."}\n\n📰 "${session.pendingTitle}"\n\nChoose the column:`,
      { reply_markup: keyboard }
    );
    await ctx.answerCallbackQuery();
    return;
  }

  // Handle headline selection for main headline
  if (data.startsWith("main_headline_")) {
    if (data === "main_headline_custom") {
      await ctx.editMessageText("✏️ Send me your custom headline:");
      await ctx.answerCallbackQuery();
      return;
    }

    const index = parseInt(data.replace("main_headline_", ""), 10);
    const selectedHeadline = session.generatedHeadlines?.[index];

    if (selectedHeadline) {
      session.pendingTitle = selectedHeadline;
      
      if (session.pendingImageUrl) {
        session.step = "awaiting_main_image_choice";
        
        const keyboard = new InlineKeyboard()
          .text("✅ Yes, include image", "main_image_yes")
          .text("❌ No image", "main_image_no");

        await ctx.editMessageText(
          `✅ Headline selected!\n\n📰 "${selectedHeadline}"\n\n🖼️ Include the article thumbnail?`,
          { reply_markup: keyboard }
        );
      } else {
        session.step = "awaiting_main_subtitle";
        await ctx.editMessageText(
          `✅ Headline selected!\n\n📰 "${selectedHeadline}"\n\nSend a subtitle (or /skip to skip):`
        );
      }
    }
    await ctx.answerCallbackQuery();
    return;
  }

  // Handle image choice for main headline
  if (data === "main_image_yes" || data === "main_image_no") {
    session.includeImage = data === "main_image_yes";
    session.step = "awaiting_main_subtitle";

    await ctx.editMessageText(
      `✅ ${data === "main_image_yes" ? "Image will be included!" : "No image."}\n\n📰 "${session.pendingTitle}"\n\nSend a subtitle (or /skip to skip):`
    );
    await ctx.answerCallbackQuery();
    return;
  }

  // Handle COTD headline selection
  if (data.startsWith("cotd_headline_")) {
    if (data === "cotd_headline_custom") {
      await ctx.editMessageText("✏️ Send me your custom title for Coin Of The Day:");
      await ctx.answerCallbackQuery();
      return;
    }

    const index = parseInt(data.replace("cotd_headline_", ""), 10);
    const selectedHeadline = session.generatedHeadlines?.[index];

    if (selectedHeadline) {
      session.pendingTitle = selectedHeadline;
      
      if (session.pendingImageUrl) {
        session.step = "awaiting_cotd_image_choice";
        
        const keyboard = new InlineKeyboard()
          .text("✅ Yes, include image", "cotd_image_yes")
          .text("❌ No image", "cotd_image_no");

        await ctx.editMessageText(
          `✅ Title selected!\n\n⭐ "${selectedHeadline}"\n\n🖼️ Include the project image?`,
          { reply_markup: keyboard }
        );
      } else {
        session.step = "awaiting_cotd_description";
        await ctx.editMessageText(
          `✅ Title selected!\n\n⭐ "${selectedHeadline}"\n\nSend a short description (or /skip to skip):`
        );
      }
    }
    await ctx.answerCallbackQuery();
    return;
  }

  // Handle COTD image choice
  if (data === "cotd_image_yes" || data === "cotd_image_no") {
    session.includeImage = data === "cotd_image_yes";
    session.step = "awaiting_cotd_description";

    await ctx.editMessageText(
      `✅ ${data === "cotd_image_yes" ? "Image will be included!" : "No image."}\n\n⭐ "${session.pendingTitle}"\n\nSend a short description (or /skip to skip):`
    );
    await ctx.answerCallbackQuery();
    return;
  }

  // Handle column selection
  if (session.step === "awaiting_column" && (data === "column_left" || data === "column_right")) {
    const column = data === "column_left" ? "left" : "right";
    
    try {
      const response = await apiRequest("/headlines", "POST", {
        title: session.pendingTitle,
        url: session.pendingUrl,
        column,
        image_url: session.includeImage ? session.pendingImageUrl : undefined,
      });

      if (response.ok) {
        const result = await response.json();
        const columnLabel = column === "left" ? "Left" : "Right";
        
        await ctx.editMessageText(
          `✅ *Headline added to ${columnLabel} column!*\n\n` +
          `📰 ${escapeMarkdown(session.pendingTitle || "")}\n` +
          `🔗 \`${session.pendingUrl || ""}\`\n` +
          `${session.includeImage ? "🖼️ With thumbnail\n" : ""}` +
          `\nID: \`${result.headline.id}\`\n` +
          `View it at: ${API_URL}`,
          { parse_mode: "Markdown" }
        );
      } else {
        const error = await response.json();
        throw new Error(error.error || "Unknown error");
      }
    } catch (error) {
      console.error("Error adding headline:", error);
      await ctx.editMessageText("❌ Failed to add headline. Please try again.");
    }

    resetSession(session);
  }

  await ctx.answerCallbackQuery();
});

// Error handler
bot.catch((err) => {
  console.error("Bot error:", err);
});

// Graceful shutdown handling
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log(`[Bot] Already shutting down, ignoring ${signal}`);
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n👋 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Stop the bot - this cancels long polling and releases the connection
    await bot.stop();
    console.log("✅ Bot stopped successfully");
  } catch (error) {
    console.error("Error stopping bot:", error);
  }
  
  process.exit(0);
}

// Handle shutdown signals
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Handle uncaught errors gracefully
process.on("uncaughtException", async (error) => {
  console.error("Uncaught exception:", error);
  await gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", async (reason) => {
  console.error("Unhandled rejection:", reason);
  // Don't exit on unhandled rejections, just log them
});

// Start the bot
console.log("🤖 Starting AINTIVIRUS Telegram Bot...");
bot.start({
  onStart: (botInfo) => {
    console.log(`✅ Bot started as @${botInfo.username}`);
    console.log(`📡 API URL: ${API_URL}`);
    console.log(`👮 Admin IDs: ${ADMIN_IDS.join(", ") || "None configured"}`);
    console.log(`🤖 OpenAI: Configured`);
    
    // Signal PM2 that the bot is ready (for graceful restarts)
    if (process.send) {
      process.send("ready");
      console.log("📤 Sent ready signal to PM2");
    }
  },
});
