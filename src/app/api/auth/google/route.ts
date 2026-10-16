import { NextResponse, type NextRequest } from "next/server";
import {
  googleAuthorizeUrl,
  googleConfig,
  googleRedirectUri,
  newOAuthState,
  OAUTH_COOKIE,
  OAUTH_MAX_AGE_SECONDS,
  sign,
} from "@/lib/auth";

export const runtime = "nodejs";

/**
 * 開始 Google 登入：產生 state 與 PKCE 驗證碼，存進短效 cookie，再導去 Google。
 *
 * state 防止別人把他的授權碼塞進你的瀏覽器（login CSRF）；
 * PKCE 讓授權碼就算在網址列外流也換不到 token。
 */
export function GET(request: NextRequest) {
  const config = googleConfig();
  if (!config) return NextResponse.redirect(new URL("/login", request.url));

  const oauth = newOAuthState(request.nextUrl.searchParams.get("next") ?? "/");
  const response = NextResponse.redirect(googleAuthorizeUrl(config, googleRedirectUri(request.nextUrl.origin), oauth));
  response.cookies.set(OAUTH_COOKIE, sign(oauth, config.secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/api/auth",
    maxAge: OAUTH_MAX_AGE_SECONDS,
  });
  return response;
}
