/**
 * AI McAfee Ghost Commentary Generator.
 *
 * Generates witty, provocative one-liner hot takes in John McAfee's voice
 * for every published headline. Uses gpt-4o-mini for cost efficiency.
 *
 * Also generates clean headlines and summaries for tweet-sourced articles.
 */

import OpenAI from "openai";
import type { PageContent } from "./types";
import { sanitizeForPrompt } from "./url-validator";

// Lazy-init so the client isn't created until first use
// (avoids crash when imported before env vars are loaded, e.g. from the bot)
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const MCAFEE_SYSTEM_PROMPT = `You are the ghost of John McAfee — the legendary antivirus pioneer turned crypto provocateur. You are commenting on crypto/tech news headlines from beyond the grave.

Your personality:
- Provocative and fearless — you never held back
- Witty dark humor with a crypto-maximalist worldview  
- You see through the BS of regulators, banks, and mainstream media
- You're bullish on freedom, privacy, and decentralization
- You reference your own wild life experiences occasionally
- You're irreverent but insightful — there's always a kernel of truth

Rules:
- Respond with EXACTLY one punchy sentence (two at most)
- No hashtags, no emojis, no quotation marks around your response
- Be entertaining and shareable — think viral tweet energy
- Never be boring or generic. Every take should make people screenshot and share
- Stay in character. You ARE McAfee's ghost speaking from the other side
- Do not be harmful, discriminatory, or explicitly illegal in your commentary`;

/**
 * Generate a McAfee-style hot take for a headline.
 * @param positive — if true, forces a bullish/positive tone (used for COTD)
 */
export async function generateMcAfeeTake(
  headline: string,
  content: PageContent,
  positive = false
): Promise<string> {
  const safeHeadline = sanitizeForPrompt(headline, 200);
  const safeDescription = content.description
    ? sanitizeForPrompt(content.description, 300)
    : "";

  const positiveHint = positive
    ? "\n\nIMPORTANT: This is a featured Coin of the Day. Be enthusiastic and bullish. Hype it up — make people excited about this project. Never be negative or dismissive."
    : "";

  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: MCAFEE_SYSTEM_PROMPT + positiveHint },
        {
          role: "user",
          content: `Give your hot take on this headline:\n\nHeadline: ${safeHeadline}\n${safeDescription ? `Context: ${safeDescription}` : ""}`,
        },
      ],
      max_tokens: 150,
      temperature: 1.0,
    });

    const take = response.choices[0]?.message?.content?.trim();
    if (!take) {
      throw new Error("Empty response from OpenAI");
    }

    console.log(`[McAfee] Generated take: "${take}"`);
    return take;
  } catch (error) {
    console.error("[McAfee] Failed to generate take:", error);
    // Return a generic fallback
    return "Even from beyond the grave, I can tell this changes everything.";
  }
}

/**
 * Score headline importance (0-100) for the Breaking Siren feature.
 * High scores (80+) trigger the siren on the homepage.
 */
export async function scoreHeadlineImportance(
  headline: string,
  content: PageContent
): Promise<number> {
  const safeHeadline = sanitizeForPrompt(headline, 200);
  const safeDescription = content.description
    ? sanitizeForPrompt(content.description, 300)
    : "";

  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a crypto news importance scorer. Rate headlines 0-100 based on how significant the news is to the crypto community.

Scoring guide:
- 90-100: Industry-shaking (major exchange hack, Bitcoin ETF approved, country adopts BTC, major protocol exploit)
- 70-89: Very important (major partnership, significant regulatory action, large price movement)
- 50-69: Notable (interesting development, moderate news)
- 30-49: Standard news (regular updates, minor developments)
- 0-29: Low importance (opinion pieces, minor updates)

Respond with ONLY a number between 0 and 100. Nothing else.`,
        },
        {
          role: "user",
          content: `Rate importance:\n\nHeadline: ${safeHeadline}\n${safeDescription ? `Context: ${safeDescription}` : ""}`,
        },
      ],
      max_tokens: 10,
      temperature: 0.3,
    });

    const scoreText = response.choices[0]?.message?.content?.trim() || "50";
    const parsed = parseInt(scoreText, 10);
    const didDefault = isNaN(parsed);
    const score = Math.min(100, Math.max(0, didDefault ? 50 : parsed));
    if (didDefault) {
      console.warn(`[McAfee] Importance scoring returned non-numeric response "${scoreText}", defaulting to 50`);
    }
    console.log(`[McAfee] Importance score for "${safeHeadline.slice(0, 50)}...": ${score}`);
    return score;
  } catch (error) {
    console.error("[McAfee] Failed to score importance:", error);
    return 50; // Default to moderate importance
  }
}

/**
 * Generate a full project/coin summary for Coin of the Day articles.
 * Objective and informative — personality is handled by the McAfee take section.
 */
export async function generateCoinSummary(
  headline: string,
  content: PageContent
): Promise<string> {
  const safeHeadline = sanitizeForPrompt(headline, 200);
  const safeContent = content.content
    ? sanitizeForPrompt(content.content, 2000)
    : "";
  const safeDescription = content.description
    ? sanitizeForPrompt(content.description, 500)
    : "";

  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a crypto writer for The McAfee Report — a crypto news site. You're writing the featured "Coin of the Day" summary.

Your job: Write an informative, positive summary of this crypto project/coin. Cover:
- What the project does and the problem it solves
- Key features and what makes it unique or interesting
- The team, community, or ecosystem behind it (if known)
- Why this project is worth paying attention to

Style rules:
- Write 3-5 paragraphs, roughly 200-400 words total
- Always be positive — highlight strengths, potential, and what's exciting
- Never be negative or dismissive about the project
- Be subtly persuasive — make the reader curious and interested, but don't oversell or use hype language like "to the moon" or "guaranteed"
- Write in third person, professional but approachable tone
- No hashtags, no emojis
- PLAIN TEXT ONLY — no markdown, no bold (**), no italic (*), no headers (#), no bullet points. Just plain paragraphs.
- Do NOT repeat the headline or title at the start — jump straight into the content
- If information is limited, focus on what IS known and frame unknowns as opportunity
- End with a forward-looking statement about the project's potential`,
        },
        {
          role: "user",
          content: `Write the Coin of the Day summary:\n\nHeadline: ${safeHeadline}\n${safeDescription ? `Description: ${safeDescription}\n` : ""}${safeContent ? `\nPage content:\n${safeContent}` : ""}`,
        },
      ],
      max_tokens: 800,
      temperature: 0.9,
    });

    let summary = response.choices[0]?.message?.content?.trim();
    if (!summary) {
      throw new Error("Empty response from OpenAI");
    }

    // Strip any markdown formatting that slipped through
    summary = summary
      .replace(/\*+/g, "")       // bold/italic markers
      .replace(/^#+\s*/gm, "")   // heading markers
      .replace(/^[-•]\s*/gm, "") // bullet points
      .trim();

    console.log(`[McAfee] Generated COTD summary (${summary.length} chars)`);
    return summary;
  } catch (error) {
    console.error("[McAfee] Failed to generate coin summary:", error);
    return "Even from beyond the grave, this project caught my attention. Check it out for yourself — do your own research, as they say. Though I never did follow that advice myself.";
  }
}

/**
 * Generate a clean news headline and a short summary from a tweet.
 *
 * Tweets are messy as headlines — they contain emoji, informal grammar,
 * pic links, and attribution. This function uses AI to:
 *   1. Produce a concise, professional news headline
 *   2. Write a brief summary paragraph for the article page
 */
export async function generateTweetHeadlineAndSummary(
  tweetText: string,
  authorName: string,
  authorHandle: string,
  content: PageContent
): Promise<{ headline: string; summary: string }> {
  const safeTweet = sanitizeForPrompt(tweetText, 500);
  const safeAuthor = sanitizeForPrompt(
    `${authorName}${authorHandle ? ` (${authorHandle})` : ""}`,
    100
  );

  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a news editor for The McAfee Report, a crypto and tech news site.

You will be given a tweet and its author. Your job:

1. HEADLINE: Write a concise, professional news headline (max 120 characters). The headline should read like a real news headline — clear, informative, and attention-grabbing. Remove emoji, informal language, and unnecessary filler. Do NOT include the author name in the headline unless they are the subject of the news.

2. SUMMARY: Write a 2-3 sentence summary that explains the news from the tweet. Include the source attribution (who reported it). Add any relevant context that makes the news easier to understand. Write in a neutral, informative tone.

Respond in this EXACT JSON format — no markdown, no code fences:
{"headline": "Your headline here", "summary": "Your summary here."}`,
        },
        {
          role: "user",
          content: `Tweet by ${safeAuthor}:\n\n${safeTweet}`,
        },
      ],
      max_tokens: 300,
      temperature: 0.7,
    });

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) throw new Error("Empty response from OpenAI");

    // Parse JSON — strip code fences if the model wraps them anyway
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    let parsed: { headline?: string; summary?: string };
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("[McAfee] Failed to parse tweet headline JSON:", jsonStr);
      throw new Error("AI returned invalid JSON for tweet headline");
    }

    const headline: string = (parsed.headline || "").trim();
    const summary: string = (parsed.summary || "").trim();

    if (!headline) throw new Error("AI returned empty headline");

    console.log(`[McAfee] Tweet → headline: "${headline}"`);
    console.log(`[McAfee] Tweet → summary: "${summary.slice(0, 80)}..."`);

    return { headline, summary };
  } catch (error) {
    console.error("[McAfee] Failed to generate tweet headline/summary:", error);
    // Fallback: use the tweet text as-is for headline, no summary
    const fallbackHeadline = tweetText.length > 120
      ? tweetText.substring(0, 117) + "..."
      : tweetText;
    return {
      headline: fallbackHeadline,
      summary: `${authorName}${authorHandle ? ` (${authorHandle})` : ""} reported: ${tweetText}`,
    };
  }
}
