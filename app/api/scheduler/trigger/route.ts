import { NextRequest, NextResponse } from "next/server";
import {
  runSchedulerCycle,
  processValidationQueue,
  publishApprovedBatch,
  getSchedulerStatus,
} from "@/lib/scheduler";
import { isAuthenticated } from "@/lib/auth";

/**
 * POST /api/scheduler/trigger
 *
 * Manually trigger a scheduler action. Useful for testing so you don't
 * have to wait for the 20-minute cron interval.
 *
 * Query params / JSON body:
 *   action: "cycle" (default) | "validate" | "publish" | "status"
 *
 * Auth: x-api-key header ONLY (query param auth removed — keys in URLs leak in logs)
 *
 * Examples:
 *   curl -X POST -H "x-api-key: YOUR_SECRET" "http://localhost:3000/api/scheduler/trigger"
 *   curl -X POST -H "x-api-key: YOUR_SECRET" "http://localhost:3000/api/scheduler/trigger?action=validate"
 */
export async function POST(request: NextRequest) {
  if (!isAuthenticated(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Accept action from query param or JSON body
  let action = request.nextUrl.searchParams.get("action") || "cycle";

  try {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => ({}));
      if (body.action) action = body.action;
    }
  } catch {
    // Ignore parse errors, use query param
  }

  try {
    switch (action) {
      case "validate": {
        console.log("[API] Manual trigger: validate");
        await processValidationQueue();
        const status = getSchedulerStatus();
        return NextResponse.json({
          success: true,
          action: "validate",
          message: "Validation queue processed",
          status,
        });
      }

      case "publish": {
        console.log("[API] Manual trigger: publish batch");
        const published = await publishApprovedBatch();
        const status = getSchedulerStatus();
        return NextResponse.json({
          success: true,
          action: "publish",
          message: published.length > 0
            ? `Published ${published.length} submission(s): ${published.map(s => `#${s.id}`).join(", ")}`
            : "No approved submissions to publish",
          published: published.map(s => ({ id: s.id, url: s.url, status: s.status })),
          status,
        });
      }

      case "status": {
        const status = getSchedulerStatus();
        return NextResponse.json({
          success: true,
          action: "status",
          status,
        });
      }

      case "cycle":
      default: {
        console.log("[API] Manual trigger: full cycle");
        const result = await runSchedulerCycle();
        const status = getSchedulerStatus();
        return NextResponse.json({
          success: true,
          action: "cycle",
          message: result.published.length > 0
            ? `Cycle complete – published ${result.published.length}: ${result.published.map(s => `#${s.id}`).join(", ")}`
            : "Cycle complete – nothing to publish",
          validated: result.validated,
          published: result.published.map(s => ({ id: s.id, url: s.url, status: s.status })),
          status,
        });
      }
    }
  } catch (error) {
    console.error("[API] Scheduler trigger error:", error);
    // SECURITY: Don't leak error details (internal paths, schema info, etc.)
    return NextResponse.json(
      {
        success: false,
        error: "Scheduler trigger failed",
      },
      { status: 500 }
    );
  }
}

// SECURITY: Removed GET handler — state-changing operations must use POST only.
// GET requests are cacheable, pre-fetchable, and vulnerable to CSRF via <img> tags.
