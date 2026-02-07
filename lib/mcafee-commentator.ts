/**
 * AI McAfee Ghost Commentary Generator.
 *
 * Generates witty, provocative one-liner hot takes in John McAfee's voice
 * for every published headline. Uses gpt-4o-mini for cost efficiency.
 */

import OpenAI from "openai";
import type { PageContent } from "./types";
import { sanitizeForPrompt } from "./url-validator";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const response = await openai.chat.completions.create({
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
    const response = await openai.chat.completions.create({
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
