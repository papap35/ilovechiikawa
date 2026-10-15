import { NextResponse } from "next/server";
import { deleteItem, getItem, updateItem } from "@/lib/store";
import { CollectionItemPatchSchema, pickProvided } from "@/lib/plush/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) return NextResponse.json({ error: "找不到這隻玩偶" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const parsed = CollectionItemPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "資料格式錯誤" },
      { status: 400 },
    );
  }

  const item = await updateItem(id, pickProvided(parsed.data, body));
  if (!item) return NextResponse.json({ error: "找不到這隻玩偶" }, { status: 404 });
  return NextResponse.json({ item });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const deleted = await deleteItem(id);
  if (!deleted) return NextResponse.json({ error: "找不到這隻玩偶" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
