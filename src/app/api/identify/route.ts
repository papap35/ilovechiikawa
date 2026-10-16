import { NextResponse } from "next/server";
import { z } from "zod";
import { hasApiKey, identifyPlush, parseDataUrl, type InputImage } from "@/lib/ai/identify";
import { authenticate } from "@/lib/api-auth";
import { refundIdentify, reserveIdentify, type QuotaStatus } from "@/lib/quota";
import { toValuationInput, valuate } from "@/lib/plush/valuation";

export const runtime = "nodejs";
/**
 * 辨識會跑比較久，但這個數字受平台方案限制：
 * Vercel Hobby 上限 60 秒，Pro 才能調到 300。設超過上限部署會被拒絕，
 * 所以取兩者都能接受的 60；升級方案後可以再往上調。
 */
export const maxDuration = 60;

const BodySchema = z.object({
  images: z.array(z.string()).min(1, "至少需要一張照片").max(4, "一次最多四張照片"),
});

export async function POST(request: Request) {
  const auth = authenticate(request);
  if ("response" in auth) return auth.response;
  const { user } = auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "請求格式錯誤" },
      { status: 400 },
    );
  }

  const images: InputImage[] = [];
  for (const dataUrl of parsed.data.images) {
    const image = parseDataUrl(dataUrl);
    if (!image) {
      return NextResponse.json(
        { error: "照片格式不支援，請使用 JPEG、PNG、WebP 或 GIF" },
        { status: 400 },
      );
    }
    images.push(image);
  }

  // 示範模式不花 API 費用，不計入額度。驗證完照片格式才預約，壞請求不會吃掉次數。
  const consumesQuota = hasApiKey();
  let quota: QuotaStatus | null = null;
  if (consumesQuota) {
    quota = await reserveIdentify(user);
    if (!quota) {
      return NextResponse.json(
        { error: "今天的 AI 鑑定次數已經用完了，明天（台灣時間午夜後）會重置。這段期間可以在鑑定頁按「不用 AI，手動建檔」。" },
        { status: 429 },
      );
    }
  }

  try {
    const result = await identifyPlush(images);
    const identification = result.identification;

    const valuation = valuate(toValuationInput(identification));

    return NextResponse.json({
      identification,
      valuation,
      mocked: result.mocked,
      usage: result.usage,
      quota,
    });
  } catch (error) {
    // 辨識失敗不該算一次：把預約的額度退回去
    if (consumesQuota) await refundIdentify(user).catch(() => undefined);
    const message = error instanceof Error ? error.message : "辨識失敗，請稍後再試";
    console.error("identify failed:", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
