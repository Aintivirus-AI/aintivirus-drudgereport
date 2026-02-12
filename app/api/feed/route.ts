/**
 * RSS / Atom Feed for The McAfee Report.
 *
 * GET /api/feed       → RSS 2.0 XML
 * GET /api/feed?format=atom → Atom 1.0 XML
 *
 * Enables discovery by RSS readers, aggregators, and search engines.
 */

import { NextRequest } from "next/server";
import { getAllHeadlines } from "@/lib/db";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
const SITE_TITLE = "THE MCAFEE REPORT";
const SITE_DESCRIPTION = "The Drudge Report of Crypto — Real-time news and updates for the crypto community";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildRss(headlines: ReturnType<typeof getAllHeadlines>): string {
  const items = headlines
    .map((h) => {
      const pubDate = new Date(h.created_at).toUTCString();
      const articleUrl = `${SITE_URL}/article/${h.id}`;
      const description = h.mcafee_take
        ? escapeXml(h.mcafee_take)
        : `Read on The McAfee Report`;
      return `    <item>
      <title>${escapeXml(h.title)}</title>
      <link>${escapeXml(articleUrl)}</link>
      <guid isPermaLink="true">${escapeXml(articleUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
      <source url="${escapeXml(SITE_URL)}">${escapeXml(SITE_TITLE)}</source>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${escapeXml(SITE_URL)}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${escapeXml(SITE_URL)}/api/feed" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
}

export async function GET(request: NextRequest) {
  const headlines = getAllHeadlines(50);
  const xml = buildRss(headlines);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
