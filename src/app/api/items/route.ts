import { NextResponse } from "next/server";
import { createItem, listItems } from "@/lib/store";
import { CollectionItemInputSchema } from "@/lib/plush/schema";

export const runtime = "nodejs";

export async function GET() {
  const items = await listItems();
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const parsed = CollectionItemInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" },
      { status: 400 },
    );
  }

  const item = await createItem(parsed.data);
  return NextResponse.json({ item }, { status: 201 });
}
