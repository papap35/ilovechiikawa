import { NextResponse, type NextRequest } from "next/server";
import { authMode, SESSION_COOKIE, userFromSessionCookie } from "@/lib/auth";

/**
 * 在所有頁面與 API 之前檢查登入狀態。
 *
 * 頁面沒登入就導到 /login；API 沒登入回 401 JSON，讓前端顯示錯誤而不是收到一頁 HTML。
 * 每個 route 與頁面自己也會再解一次使用者（決定讀誰的收藏庫），這裡是第一道門。
 */

/** 不需要登入就能打開的路徑：登入流程本身，以及 PWA 安裝需要的檔案。 */
const PUBLIC_PATHS = new Set([
  "/login",
  "/api/auth/google",
  "/api/auth/callback/google",
  "/api/auth/logout",
  "/manifest.webmanifest",
  "/sw.js",
  "/icon.png",
]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/icons/")) return NextResponse.next();

  const isApi = pathname.startsWith("/api/");

  if (authMode() === "misconfigured") {
    if (isApi) {
      return NextResponse.json(
        { error: "伺服器的 Google 登入尚未設定完成，已停止對外提供資料。" },
        { status: 503 },
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (userFromSessionCookie(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (isApi) return NextResponse.json({ error: "請先登入" }, { status: 401 });

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Next.js 自己的靜態資源不經過檢查，其餘全部都要
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
