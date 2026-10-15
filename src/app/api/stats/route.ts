import { NextResponse } from "next/server";
import { listItems } from "@/lib/store";
import { computeStats } from "@/lib/plush/stats";

export const runtime = "nodejs";

export async function GET() {
  const items = await listItems();
  return NextResponse.json({ stats: computeStats(items) });
}
