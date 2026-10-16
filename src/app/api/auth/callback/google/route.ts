import { NextResponse, type NextRequest } from "next/server";
import {
  fetchGoogleUser,
  GoogleLoginError,
  googleConfig,
  googleRedirectUri,
  OAUTH_COOKIE,
  readOAuthState,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSession,
} from "@/lib/auth";

export const runtime = "nodejs";

function failure(request: NextRequest, message: string) {
  const login = new URL("/login", request.url);
  login.searchParams.set("error", message);
  const response = NextResponse.redirect(login);
  response.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth", maxAge: 0 });
  return response;
}

/** Google 登入完成後導回這裡：核對 state、用授權碼換使用者資料、發 session cookie。 */
export async function GET(request: NextRequest) {
  const config = googleConfig();
  if (!config) return failure(request, "伺服器的 Google 登入尚未設定完成。");

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return failure(request, "已取消 Google 登入。");

  const oauth = readOAuthState(request.cookies.get(OAUTH_COOKIE)?.value, config.secret);
  const code = params.get("code");
  if (!oauth || !code || params.get("state") !== oauth.state) {
    return failure(request, "登入逾時或連結無效，請重新登入。");
  }

  try {
    const user = await fetchGoogleUser(config, code, oauth.verifier, googleRedirectUri(request.nextUrl.origin));
    const response = NextResponse.redirect(new URL(oauth.next, request.url));
    response.cookies.set(SESSION_COOKIE, signSession(user, config.secret), {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    response.cookies.set(OAUTH_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    return response;
  } catch (error) {
    console.error("google login failed:", error);
    return failure(
      request,
      error instanceof GoogleLoginError ? error.message : "Google 登入失敗，請稍後再試。",
    );
  }
}
