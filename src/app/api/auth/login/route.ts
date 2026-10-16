import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AUTH_COOKIE,
  AUTH_MAX_AGE_SECONDS,
  authMode,
  configuredPassword,
  sessionToken,
  verifyPassword,
} from "@/lib/auth";

export const runtime = "nodejs";

const BodySchema = z.object({ password: z.string() });

/** 密碼錯誤時的延遲，讓逐一猜密碼的速度慢下來。 */
const FAILURE_DELAY_MS = 600;

export async function POST(request: Request) {
  if (authMode() !== "password") {
    return NextResponse.json(
      { error: "伺服器尚未設定存取密碼（CHIIKAWA_PASSWORD）。" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "請求格式錯誤" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success || !verifyPassword(parsed.data.password)) {
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    return NextResponse.json({ error: "密碼不正確" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, sessionToken(configuredPassword()!), {
    httpOnly: true,
    sameSite: "lax",
    // 部署後一定是 https；本機 http 開發時不加 secure，否則 cookie 存不進去
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    maxAge: AUTH_MAX_AGE_SECONDS,
  });
  return response;
}
