/**
 * AI McAfee Ghost Commentary Generator.
 *
 * Generates witty, provocative one-liner hot takes in John McAfee's voice
 * for every published headline. Uses gpt-4o-mini for cost efficiency.
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
 */
export async function generateMcAfeeTake(
  headline: string,
  content: PageContent
): Promise<string> {
  const safeHeadline = sanitizeForPrompt(headline, 200);
  const safeDescription = content.description
    ? sanitizeForPrompt(content.description, 300)
    : "";

  try {
    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: MCAFEE_SYSTEM_PROMPT },
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
    const score = Math.min(100, Math.max(0, parseInt(scoreText, 10) || 50));
    console.log(`[McAfee] Importance score for "${safeHeadline.slice(0, 50)}...": ${score}`);
    return score;
  } catch (error) {
    console.error("[McAfee] Failed to score importance:", error);
    return 50; // Default to moderate importance
  }
}

/**
 * Generate a full project/coin summary for Coin of the Day articles.
 * Written in McAfee's voice — informative but with personality.
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
          content: `You are the ghost of John McAfee writing a featured "Coin of the Day" deep-dive for The McAfee Report — a crypto news site.

Your job: Write a compelling, informative summary of this crypto project/coin. Cover:
- What the project does and why it matters
- Key features and what makes it unique
- The team or community behind it (if known)
- Why crypto degens should pay attention

Style rules:
- Write 3-5 paragraphs, roughly 200-400 words total
- Be informative first, entertaining second
- Inject McAfee's personality — bold opinions, crypto-maximalist worldview, slight irreverence
- No hashtags, no emojis
- Don't start with "Ladies and gentlemen" or similar clichés
- Write in first person as McAfee's ghost
- Be honest — if information is limited, say so rather than making things up
- End with a clear verdict or takeaway`,
        },
        {
          role: "user",
          content: `Write the Coin of the Day summary:\n\nHeadline: ${safeHeadline}\n${safeDescription ? `Description: ${safeDescription}\n` : ""}${safeContent ? `\nPage content:\n${safeContent}` : ""}`,
        },
      ],
      max_tokens: 800,
      temperature: 0.9,
    });

    const summary = response.choices[0]?.message?.content?.trim();
    if (!summary) {
      throw new Error("Empty response from OpenAI");
    }

    console.log(`[McAfee] Generated COTD summary (${summary.length} chars)`);
    return summary;
  } catch (error) {
    console.error("[McAfee] Failed to generate coin summary:", error);
    return "Even from beyond the grave, this project caught my attention. Check it out for yourself — do your own research, as they say. Though I never did follow that advice myself.";
  }
}
