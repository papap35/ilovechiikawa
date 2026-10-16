import { NextResponse } from "next/server";
import { listItems } from "@/lib/store";
import { computeStats } from "@/lib/plush/stats";
import { authenticate } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = authenticate(request);
  if ("response" in auth) return auth.response;

  const items = await listItems(auth.user.id);
  return NextResponse.json({ stats: computeStats(items) });
}
