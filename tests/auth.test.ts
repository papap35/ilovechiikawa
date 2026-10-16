import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  authMode,
  isValidSession,
  safeNextPath,
  sessionToken,
  verifyPassword,
} from "@/lib/auth";
import { proxy } from "@/proxy";
import { POST as loginRoute } from "@/app/api/auth/login/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";

const PASSWORD = "hachiware-2026";

beforeEach(() => {
  vi.stubEnv("CHIIKAWA_PASSWORD", PASSWORD);
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function request(path: string, cookie?: string) {
  return new NextRequest(`https://example.test${path}`, {
    headers: cookie ? { cookie: `${AUTH_COOKIE}=${cookie}` } : {},
  });
}

const login = (body: unknown) =>
  loginRoute(
    new Request("https://example.test/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("authMode", () => {
  it("設了密碼就需要登入", () => {
    expect(authMode()).toBe("password");
  });

  it("正式環境沒設密碼時一律擋下，而不是默默公開", () => {
    vi.stubEnv("CHIIKAWA_PASSWORD", "");
    expect(authMode()).toBe("misconfigured");
  });

  it("開發環境沒設密碼時不設防，方便本機開發", () => {
    vi.stubEnv("CHIIKAWA_PASSWORD", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(authMode()).toBe("open");
  });
});

describe("密碼與 session", () => {
  it("只接受正確的密碼", () => {
    expect(verifyPassword(PASSWORD)).toBe(true);
    expect(verifyPassword("usagi")).toBe(false);
    expect(verifyPassword("")).toBe(false);
  });

  it("cookie 內容不含密碼本身", () => {
    expect(sessionToken(PASSWORD)).not.toContain(PASSWORD);
  });

  it("只認得用目前密碼簽出的 session", () => {
    expect(isValidSession(sessionToken(PASSWORD))).toBe(true);
    expect(isValidSession(sessionToken("舊密碼"))).toBe(false);
    expect(isValidSession("亂填的")).toBe(false);
    expect(isValidSession(undefined)).toBe(false);
  });

  it("換密碼會讓舊的 session 全部失效", () => {
    const old = sessionToken(PASSWORD);
    vi.stubEnv("CHIIKAWA_PASSWORD", "new-password");
    expect(isValidSession(old)).toBe(false);
  });

  it("沒設密碼時任何 session 都不算數", () => {
    vi.stubEnv("CHIIKAWA_PASSWORD", "");
    expect(isValidSession(sessionToken(""))).toBe(false);
    expect(verifyPassword("")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("站內路徑原樣保留", () => {
    expect(safeNextPath("/item/abc?x=1")).toBe("/item/abc?x=1");
  });

  it("拒絕站外與協定相對網址，避免開放式轉址", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
    expect(safeNextPath(undefined)).toBe("/");
  });

  it("不導回登入頁本身，避免繞圈", () => {
    expect(safeNextPath("/login")).toBe("/");
  });
});

describe("proxy", () => {
  it("沒登入打開頁面時導到登入頁，並記住原本要去哪", () => {
    const response = proxy(request("/item/abc"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/item/abc");
  });

  it("沒登入呼叫 API 時回 401 JSON，而不是一頁 HTML", async () => {
    const response = proxy(request("/api/items"));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toContain("登入");
  });

  it("匯出備份也在保護範圍內", () => {
    expect(proxy(request("/api/collection/export")).status).toBe(401);
  });

  it("帶著有效的 session 就放行", () => {
    const response = proxy(request("/api/items", sessionToken(PASSWORD)));
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("偽造或過期的 session 擋下", () => {
    expect(proxy(request("/api/items", sessionToken("猜的"))).status).toBe(401);
  });

  it("登入頁與 PWA 安裝需要的檔案不需要登入", () => {
    for (const path of ["/login", "/api/auth/login", "/manifest.webmanifest", "/sw.js", "/icons/icon-192.png", "/icon.png"]) {
      expect(proxy(request(path)).headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("正式環境沒設密碼時，API 回 503、頁面導到說明頁", () => {
    vi.stubEnv("CHIIKAWA_PASSWORD", "");
    expect(proxy(request("/api/items")).status).toBe(503);
    expect(new URL(proxy(request("/")).headers.get("location")!).pathname).toBe("/login");
  });

  it("開發環境沒設密碼時全部放行", () => {
    vi.stubEnv("CHIIKAWA_PASSWORD", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(proxy(request("/api/items")).headers.get("x-middleware-next")).toBe("1");
  });
});

describe("POST /api/auth/login", () => {
  it("密碼正確時發出 HttpOnly 的 session cookie", async () => {
    const response = await login({ password: PASSWORD });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${AUTH_COOKIE}=${sessionToken(PASSWORD)}`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("secure");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });

  it("密碼錯誤時回 401 且不發 cookie", async () => {
    const response = await login({ password: "wrong" });
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("格式錯誤時不洩漏細節，也不發 cookie", async () => {
    expect((await login("{壞掉")).status).toBe(400);
    const response = await login({ pass: PASSWORD });
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("沒設密碼時無法登入", async () => {
    vi.stubEnv("CHIIKAWA_PASSWORD", "");
    expect((await login({ password: "" })).status).toBe(503);
  });
});

describe("POST /api/auth/logout", () => {
  it("清掉 session cookie", async () => {
    const cookie = (await logoutRoute()).headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${AUTH_COOKIE}=;`);
    expect(cookie).toMatch(/max-age=0/i);
  });
});
