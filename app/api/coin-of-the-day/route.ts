import { NextRequest, NextResponse } from "next/server";
import { getCoinOfTheDay, setCoinOfTheDay } from "@/lib/db";
import { isAuthenticated, isSafeUrlProtocol } from "@/lib/auth";
import type { SetCoinOfTheDayRequest } from "@/lib/types";

/**
 * GET /api/coin-of-the-day
 * Returns the current coin of the day
 */
export async function GET() {
  try {
    const coinOfTheDay = getCoinOfTheDay();
    return NextResponse.json({ coinOfTheDay });
  } catch (error) {
    console.error("Error fetching coin of the day:", error);
    return NextResponse.json(
      { error: "Failed to fetch coin of the day" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/coin-of-the-day
 * Body: { title: string, url: string, description?: string, image_url?: string }
 * Requires x-api-key header
 */
export async function PUT(request: NextRequest) {
  try {
    if (!isAuthenticated(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body: SetCoinOfTheDayRequest = await request.json();

    if (!body.title || !body.url) {
      return NextResponse.json(
        { error: "Missing required fields: title and url" },
        { status: 400 }
      );
    }

    // Input validation
    if (body.title.length > 500) {
      return NextResponse.json(
        { error: "Title must be 500 characters or less" },
        { status: 400 }
      );
    }

    if (body.url.length > 2048 || !isSafeUrlProtocol(body.url)) {
      return NextResponse.json(
        { error: "Invalid URL (must be http/https, max 2048 chars)" },
        { status: 400 }
      );
    }

    if (body.description && body.description.length > 5000) {
      return NextResponse.json(
        { error: "Description must be 5000 characters or less" },
        { status: 400 }
      );
    }

    if (body.image_url && (body.image_url.length > 2048 || !isSafeUrlProtocol(body.image_url))) {
      return NextResponse.json(
        { error: "Invalid image URL" },
        { status: 400 }
      );
    }

    const coinOfTheDay = setCoinOfTheDay(body.title, body.url, body.description, body.image_url);

    return NextResponse.json({ coinOfTheDay });
  } catch (error) {
    console.error("Error updating coin of the day:", error);
    return NextResponse.json(
      { error: "Failed to update coin of the day" },
      { status: 500 }
    );
  }
}
