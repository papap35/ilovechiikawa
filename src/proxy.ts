import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authMode, isValidSession } from "@/lib/auth";

/**
 * 在所有頁面與 API 之前檢查登入狀態。
 *
 * 部署到雲端之後，任何知道網址的人都能讀寫收藏庫——這裡就是那道門。
 * 頁面沒登入就導到 /login；API 沒登入回 401 JSON，讓前端顯示錯誤而不是收到一頁 HTML。
 */

/** 不需要登入就能打開的路徑：登入本身，以及 PWA 安裝需要的檔案。 */
const PUBLIC_PATHS = new Set(["/login", "/api/auth/login", "/manifest.webmanifest", "/sw.js", "/icon.png"]);

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/icons/")) return NextResponse.next();

  const mode = authMode();
  if (mode === "open") return NextResponse.next();

  const isApi = pathname.startsWith("/api/");

  if (mode === "misconfigured") {
    if (isApi) {
      return NextResponse.json(
        { error: "伺服器尚未設定存取密碼（CHIIKAWA_PASSWORD），已停止對外提供資料。" },
        { status: 503 },
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isValidSession(request.cookies.get(AUTH_COOKIE)?.value)) return NextResponse.next();

  if (isApi) {
    return NextResponse.json({ error: "請先登入" }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Next.js 自己的靜態資源不經過檢查，其餘全部都要
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
