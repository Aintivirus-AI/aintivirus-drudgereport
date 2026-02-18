/**
 * Dynamic sitemap generation for Google Search Console.
 * Automatically discovers all article pages + static routes.
 */

import type { MetadataRoute } from "next";
import { getAllHeadlines } from "@/lib/db";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "always",
      priority: 1.0,
    },
    {
      url: `${siteUrl}/analytics`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/leaderboard`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.6,
    },
  ];

  // Dynamic article pages
  const headlines = getAllHeadlines(500);
  const articlePages: MetadataRoute.Sitemap = headlines.map((h) => ({
    url: `${siteUrl}/article/${h.id}`,
    lastModified: new Date(h.created_at),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  return [...staticPages, ...articlePages];
}
