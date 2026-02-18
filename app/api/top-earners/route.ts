import { NextRequest, NextResponse } from "next/server";
import { getTopEarners } from "@/lib/db";

const LAMPORTS_PER_SOL = 1_000_000_000;

/**
 * GET /api/top-earners?period=day|week|month|all
 */
export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "all";
  const validPeriods = ["day", "week", "month", "all"];

  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: "Invalid period. Use: day, week, month, all" }, { status: 400 });
  }

  const earners = getTopEarners(period, 15);

  // Convert lamports to SOL for the response
  const formatted = earners.map((e) => ({
    ...e,
    total_earned_sol: e.total_earned_lamports / LAMPORTS_PER_SOL,
  }));

  return NextResponse.json({ earners: formatted, period });
}
