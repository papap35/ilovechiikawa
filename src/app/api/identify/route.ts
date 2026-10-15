import { NextResponse } from "next/server";
import { z } from "zod";
import { identifyPlush, parseDataUrl, type InputImage } from "@/lib/ai/identify";
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

  try {
    const result = await identifyPlush(images);
    const identification = result.identification;

    const valuation = valuate(toValuationInput(identification));

    return NextResponse.json({
      identification,
      valuation,
      mocked: result.mocked,
      usage: result.usage,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "辨識失敗，請稍後再試";
    console.error("identify failed:", error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
