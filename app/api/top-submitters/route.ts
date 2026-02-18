import { NextRequest, NextResponse } from "next/server";
import { getTopSubmitters } from "@/lib/db";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") || "all";
  const validPeriods = ["day", "week", "month", "all"];

  if (!validPeriods.includes(period)) {
    return NextResponse.json({ error: "Invalid period. Use: day, week, month, all" }, { status: 400 });
  }

  const submitters = getTopSubmitters(period, 15);
  return NextResponse.json({ submitters, period });
}
