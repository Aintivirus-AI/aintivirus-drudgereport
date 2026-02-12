import { NextRequest, NextResponse } from "next/server";
import { getMainHeadline, setMainHeadline } from "@/lib/db";
import { isAuthenticated } from "@/lib/auth";
import type { SetMainHeadlineRequest } from "@/lib/types";

/**
 * GET /api/main-headline
 * Returns the current main headline
 */
export async function GET() {
  try {
    const mainHeadline = getMainHeadline();
    return NextResponse.json({ mainHeadline });
  } catch (error) {
    console.error("Error fetching main headline:", error);
    return NextResponse.json(
      { error: "Failed to fetch main headline" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/main-headline
 * Body: { title: string, url: string, subtitle?: string, image_url?: string }
 * Requires x-api-key header
 */
export async function PUT(request: NextRequest) {
  try {
    // Check authorization (timing-safe comparison)
    if (!isAuthenticated(request)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body: SetMainHeadlineRequest = await request.json();

    // Validate required fields
    if (!body.title || !body.url) {
      return NextResponse.json(
        { error: "Missing required fields: title and url" },
        { status: 400 }
      );
    }

    // Update main headline
    const mainHeadline = setMainHeadline(body.title, body.url, body.subtitle, body.image_url);

    return NextResponse.json({ mainHeadline });
  } catch (error) {
    console.error("Error updating main headline:", error);
    return NextResponse.json(
      { error: "Failed to update main headline" },
      { status: 500 }
    );
  }
}
