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
import {
  isWhitelisted,
  addToWhitelist,
  removeFromWhitelist,
  getWhitelist,
  getAllHeadlines,
  removeHeadline,
} from "../lib/db";

// Session data interface
interface SessionData {
  step: "idle" | "awaiting_url" | "awaiting_headline_choice" | "awaiting_image_choice" | "awaiting_column" | "awaiting_main_url" | "awaiting_main_headline_choice" | "awaiting_main_image_choice" | "awaiting_main_subtitle";
  pendingUrl?: string;
  pendingTitle?: string;
  pendingColumn?: "left" | "right";
  pendingImageUrl?: string;
  includeImage?: boolean;
  generatedHeadlines?: string[];
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

// Helper: Fetch webpage content including image
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

// Helper: Fetch YouTube video info using oEmbed API
async function fetchYouTubeContent(url: string): Promise<{ title: string; description: string; content: string; imageUrl: string | null }> {
  const videoId = getYouTubeVideoId(url);
  
  try {
    // Use YouTube oEmbed to get basic info
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const oembedResponse = await fetch(oembedUrl);
    const oembedData = await oembedResponse.json();
    
    // Also fetch the page to get the description
    const pageResponse = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const html = await pageResponse.text();
    
    // Extract description from meta tags (YouTube uses og:description)
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
      content: description, // Use description as content for AI to generate headline
      imageUrl,
    };
  } catch (error) {
    console.error("Error fetching YouTube content:", error);
    // Fallback to regular page fetch
    return fetchRegularPageContent(url);
  }
}

// Helper: Fetch regular page content
async function fetchRegularPageContent(url: string): Promise<{ title: string; description: string; content: string; imageUrl: string | null }> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    const html = await response.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : "";

    // Extract og:title if available
    const ogTitleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    const ogTitle = ogTitleMatch ? ogTitleMatch[1].trim() : "";

    // Extract og:description if available
    const ogDescMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
                        html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i);
    const ogDescription = ogDescMatch ? ogDescMatch[1].trim() : "";

    // Extract og:image (article thumbnail)
    const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i);
    let imageUrl = ogImageMatch ? ogImageMatch[1].trim() : null;

    // Also try twitter:image as fallback
    if (!imageUrl) {
      const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i) ||
                                html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i);
      imageUrl = twitterImageMatch ? twitterImageMatch[1].trim() : null;
    }

    // Extract first paragraph or article text (basic extraction)
    const paragraphMatch = html.match(/<p[^>]*>([^<]{50,500})<\/p>/i);
    const paragraphText = paragraphMatch ? paragraphMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    return {
      title: ogTitle || title,
      description: ogDescription || description,
      content: paragraphText,
      imageUrl,
    };
  } catch (error) {
    console.error("Error fetching page:", error);
    return { title: "", description: "", content: "", imageUrl: null };
  }
}

async function fetchPageContent(url: string): Promise<{ title: string; description: string; content: string; imageUrl: string | null }> {
  // Use YouTube-specific fetching for YouTube URLs
  if (isYouTubeUrl(url)) {
    return fetchYouTubeContent(url);
  }
  return fetchRegularPageContent(url);
}

// Helper: Generate headlines using OpenAI
async function generateHeadlines(url: string, pageData: { title: string; description: string; content: string }): Promise<string[]> {
  const prompt = `You are a headline writer for a news aggregator site similar to Drudge Report. 
Based on the following article information, generate 3 different punchy, attention-grabbing headline options.

URL: ${url}
Original Title: ${pageData.title}
Description: ${pageData.description}
Content Preview: ${pageData.content}

Requirements:
- Headlines should be concise (under 80 characters)
- Use active voice and strong verbs
- Make them intriguing and click-worthy
- Capture the essence of the story
- Style similar to Drudge Report headlines (dramatic, urgent when appropriate)

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

// Helper: Reset session
function resetSession(session: SessionData) {
  session.step = "idle";
  session.pendingUrl = undefined;
  session.pendingTitle = undefined;
  session.pendingColumn = undefined;
  session.pendingImageUrl = undefined;
  session.includeImage = undefined;
  session.generatedHeadlines = undefined;
}

// Command: /start
bot.command("start", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;

  const authorized = isAuthorized(userId);
  const admin = isAdmin(userId);

  let message = `🌐 *AINTIVIRUS Bot*\n\n`;
  
  if (!authorized) {
    message += `⚠️ You are not authorized to use this bot.\n`;
    message += `Your Telegram ID: \`${userId}\`\n\n`;
    message += `Contact an admin to get whitelisted.`;
  } else {
    message += `Welcome! You are ${admin ? "an *admin*" : "a *whitelisted user*"}.\n\n`;
    message += `*Available Commands:*\n`;
    message += `/add - Add a new headline (AI-generated)\n`;
    message += `/main - Set the main headline\n`;
    message += `/list - View recent headlines\n`;
    message += `/remove - Remove a headline\n`;
    message += `/help - Show this help message\n`;
    
    if (admin) {
      message += `\n*Admin Commands:*\n`;
      message += `/whitelist - View whitelisted users\n`;
      message += `/adduser <id> - Add user to whitelist\n`;
      message += `/removeuser <id> - Remove user from whitelist\n`;
    }
  }

  await ctx.reply(message, { parse_mode: "Markdown" });
});

// Command: /help
bot.command("help", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId || !isAuthorized(userId)) {
    await ctx.reply("⚠️ You are not authorized to use this bot.");
    return;
  }

  const admin = isAdmin(userId);
  let message = `📖 *AINTIVIRUS Bot Help*\n\n`;
  message += `*Headline Commands:*\n`;
  message += `/add - Send a URL and AI generates headline options\n`;
  message += `/main - Set the main/center headline\n`;
  message += `/list - View recent headlines with IDs\n`;
  message += `/remove <id> - Remove a headline by ID\n`;
  message += `/cancel - Cancel current operation\n`;

  if (admin) {
    message += `\n*Admin Commands:*\n`;
    message += `/whitelist - View all whitelisted users\n`;
    message += `/adduser <telegram_id> [username] - Add to whitelist\n`;
    message += `/removeuser <telegram_id> - Remove from whitelist\n`;
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
  if (!userId || !isAuthorized(userId)) {
    return;
  }

  const text = ctx.message.text;
  const session = ctx.session;

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
          `🔗 ${escapeMarkdown(session.pendingUrl || "")}\n` +
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
      // User typed a custom headline
      session.pendingTitle = text;
      
      // If there's an image, ask about including it
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
        // No image, go straight to column selection
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
      
      // If there's an image, ask about including it
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
        // No image, go to subtitle
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
            `📰 ${session.pendingTitle}\n` +
            `🔗 ${session.pendingUrl}\n` +
            `${subtitle ? `📝 ${subtitle}\n` : ""}` +
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
      break;
    }

    default:
      // No active flow
      break;
  }
});

// Handle callback queries (button clicks)
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const session = ctx.session;

  // Handle headline selection for regular headlines
  if (data.startsWith("headline_")) {
    if (data === "headline_custom") {
      await ctx.editMessageText("✏️ Send me your custom headline:");
      // Keep the step as awaiting_headline_choice - the text handler will catch it
      await ctx.answerCallbackQuery();
      return;
    }

    const index = parseInt(data.replace("headline_", ""), 10);
    const selectedHeadline = session.generatedHeadlines?.[index];

    if (selectedHeadline) {
      session.pendingTitle = selectedHeadline;
      
      // If there's an image, ask about including it
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
        // No image, go to column selection
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
      // Keep the step as awaiting_main_headline_choice
      await ctx.answerCallbackQuery();
      return;
    }

    const index = parseInt(data.replace("main_headline_", ""), 10);
    const selectedHeadline = session.generatedHeadlines?.[index];

    if (selectedHeadline) {
      session.pendingTitle = selectedHeadline;
      
      // If there's an image, ask about including it
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
        // No image, go to subtitle
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
          `🔗 ${escapeMarkdown(session.pendingUrl || "")}\n` +
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

    // Reset session
    resetSession(session);
  }

  await ctx.answerCallbackQuery();
});

// Error handler
bot.catch((err) => {
  console.error("Bot error:", err);
});

// Start the bot
console.log("🤖 Starting AINTIVIRUS Telegram Bot...");
bot.start({
  onStart: (botInfo) => {
    console.log(`✅ Bot started as @${botInfo.username}`);
    console.log(`📡 API URL: ${API_URL}`);
    console.log(`👮 Admin IDs: ${ADMIN_IDS.join(", ") || "None configured"}`);
    console.log(`🤖 OpenAI: Configured`);
  },
});
