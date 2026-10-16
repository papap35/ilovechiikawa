import { NextResponse } from "next/server";
import { replaceAll } from "@/lib/store";
import { authenticate } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * 匯入收藏庫，覆蓋目前使用者現有的內容（不影響其他人）。
 *
 * 匯入的資料會經過與讀檔相同的逐筆驗證，
 * 驗不過的那幾筆會被跳過並回報數量，
 * 而不是整批拒絕——使用者手上可能只有那一份備份。
 */
export async function POST(request: Request) {
  const auth = authenticate(request);
  if ("response" in auth) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "檔案不是合法的 JSON" }, { status: 400 });
  }

  if (!Array.isArray(body)) {
    return NextResponse.json(
      { error: "格式不符：預期是一個收藏品陣列" },
      { status: 400 },
    );
  }

  const imported = await replaceAll(auth.user.id, body);
  const skipped = body.length - imported;

  return NextResponse.json({ imported, skipped });
}
