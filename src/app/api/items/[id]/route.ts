import { NextResponse } from "next/server";
import { deleteItem, getItem, updateItem } from "@/lib/store";
import { CollectionItemPatchSchema, pickProvided } from "@/lib/plush/schema";
import { authenticate } from "@/lib/api-auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// 找不到與「是別人的」回同一個 404：不讓人用 id 試探別人的收藏存不存在。
// 實際上也是如此——每個人只會去讀自己的收藏庫，別人的 id 本來就查不到。
const notFound = () => NextResponse.json({ error: "找不到這隻玩偶" }, { status: 404 });

export async function GET(request: Request, { params }: Params) {
  const auth = authenticate(request);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const item = await getItem(auth.user.id, id);
  if (!item) return notFound();
  return NextResponse.json({ item });
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = authenticate(request);
  if ("response" in auth) return auth.response;

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

  const item = await updateItem(auth.user.id, id, pickProvided(parsed.data, body));
  if (!item) return notFound();
  return NextResponse.json({ item });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = authenticate(request);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const deleted = await deleteItem(auth.user.id, id);
  if (!deleted) return notFound();
  return NextResponse.json({ ok: true });
}
