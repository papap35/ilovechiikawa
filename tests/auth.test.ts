import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  authMode,
  cookieFromHeader,
  fetchGoogleUser,
  googleAuthorizeUrl,
  googleConfig,
  LOCAL_USER,
  newOAuthState,
  OAUTH_COOKIE,
  pkceChallenge,
  readOAuthState,
  readSession,
  safeNextPath,
  SESSION_COOKIE,
  sign,
  signSession,
  userFromRequest,
  userIdFromGoogleSub,
  type SessionUser,
} from "@/lib/auth";
import { proxy } from "@/proxy";
import { GET as startLogin } from "@/app/api/auth/google/route";
import { GET as callback } from "@/app/api/auth/callback/google/route";
import { POST as logoutRoute } from "@/app/api/auth/logout/route";

const SECRET = "x".repeat(40);
const USER: SessionUser = { id: "g-1234567890", email: "usagi@example.com", name: "烏薩奇", picture: null };

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("AUTH_SECRET", SECRET);
  vi.stubEnv("NODE_ENV", "production");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function clearAuthEnv() {
  vi.stubEnv("GOOGLE_CLIENT_ID", "");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
  vi.stubEnv("AUTH_SECRET", "");
}

function request(path: string, cookies: Record<string, string> = {}) {
  const cookie = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`https://example.test${path}`, { headers: cookie ? { cookie } : {} });
}

describe("authMode", () => {
  it("三個變數都設好就用 Google 登入", () => {
    expect(authMode()).toBe("google");
  });

  it("正式環境什麼都沒設時一律擋下，而不是默默公開", () => {
    clearAuthEnv();
    expect(authMode()).toBe("misconfigured");
  });

  it("開發環境什麼都沒設時不設防，方便本機開發", () => {
    clearAuthEnv();
    vi.stubEnv("NODE_ENV", "development");
    expect(authMode()).toBe("open");
  });

  it("設定到一半時，就算在開發環境也不放行", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "太短");
    expect(googleConfig()).toBeNull();
    expect(authMode()).toBe("misconfigured");
  });
});

describe("session cookie", () => {
  it("簽出來的 session 讀得回同一個使用者", () => {
    expect(readSession(signSession(USER, SECRET), SECRET)).toEqual(USER);
  });

  it("竄改內容就失效：不能把自己改成別人", () => {
    const token = signSession(USER, SECRET);
    const [, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...USER, id: "g-999", exp: 9999999999 })).toString("base64url");
    expect(readSession(`${forged}.${signature}`, SECRET)).toBeNull();
  });

  it("換了 AUTH_SECRET，舊的 session 全部失效", () => {
    expect(readSession(signSession(USER, SECRET), "y".repeat(40))).toBeNull();
  });

  it("過期就失效", () => {
    const issued = new Date("2026-01-01T00:00:00Z");
    const token = signSession(USER, SECRET, issued);
    expect(readSession(token, SECRET, new Date("2026-01-20T00:00:00Z"))).toEqual(USER);
    expect(readSession(token, SECRET, new Date("2026-03-01T00:00:00Z"))).toBeNull();
  });

  it("id 不合法的 session 不採信，避免組出危險的儲存路徑", () => {
    const token = sign({ ...USER, id: "../../etc", exp: 9999999999 }, SECRET);
    expect(readSession(token, SECRET)).toBeNull();
  });

  it("亂填的值、空值都當作沒登入", () => {
    for (const value of ["", "abc", "a.b", undefined, null]) expect(readSession(value, SECRET)).toBeNull();
  });

  it("route 從 Cookie 標頭解出使用者", () => {
    const req = new Request("https://example.test/api/items", {
      headers: { cookie: `other=1; ${SESSION_COOKIE}=${signSession(USER, SECRET)}` },
    });
    expect(userFromRequest(req)).toEqual(USER);
    expect(userFromRequest(new Request("https://example.test/api/items"))).toBeNull();
  });

  it("開發模式不需要 cookie，一律是本機使用者", () => {
    clearAuthEnv();
    vi.stubEnv("NODE_ENV", "development");
    expect(userFromRequest(new Request("http://localhost/api/items"))).toEqual(LOCAL_USER);
  });

  it("cookieFromHeader 只取完全同名的 cookie", () => {
    expect(cookieFromHeader("a=1; chiikawa_session_x=2; chiikawa_session=3", SESSION_COOKIE)).toBe("3");
    expect(cookieFromHeader(null, SESSION_COOKIE)).toBeNull();
  });
});

describe("Google OAuth 的組成", () => {
  it("登入網址帶 state、PKCE 與正確的導回網址", () => {
    const oauth = newOAuthState("/scan");
    const url = new URL(googleAuthorizeUrl(googleConfig()!, "https://example.test/api/auth/callback/google", oauth));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("state")).toBe(oauth.state);
    expect(url.searchParams.get("code_challenge")).toBe(pkceChallenge(oauth.verifier));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.test/api/auth/callback/google");
  });

  it("每次登入的 state 與驗證碼都不同", () => {
    expect(newOAuthState("/").state).not.toBe(newOAuthState("/").state);
  });

  it("使用者 id 取自 Google 的 sub，不用會變的 email", () => {
    expect(userIdFromGoogleSub("1234567890")).toBe("g-1234567890");
    expect(userIdFromGoogleSub("怪格式")).toMatch(/^g-[0-9a-f]{40}$/);
  });
});

/** 假的 Google：token 端點與 userinfo 端點。 */
function fakeGoogle(info: Record<string, unknown>, tokenOk = true) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return tokenOk
        ? Response.json({ access_token: "at-123" })
        : new Response("bad", { status: 400 });
    }
    return Response.json(info);
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe("fetchGoogleUser", () => {
  it("換到使用者資料，並把驗證碼與 client secret 送給 Google", async () => {
    const { fetchImpl, calls } = fakeGoogle({ sub: "42", email: "a@b.c", email_verified: true, name: "小八" });
    const user = await fetchGoogleUser(googleConfig()!, "code-1", "verifier-1", "https://x/cb", fetchImpl);
    expect(user).toEqual({ id: "g-42", email: "a@b.c", name: "小八", picture: null });

    const body = new URLSearchParams(String(calls[0].init?.body));
    expect(body.get("code")).toBe("code-1");
    expect(body.get("code_verifier")).toBe("verifier-1");
    expect(body.get("client_secret")).toBe("client-secret");
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe("Bearer at-123");
  });

  it("email 沒驗證的帳號拒絕登入", async () => {
    const { fetchImpl } = fakeGoogle({ sub: "42", email: "a@b.c", email_verified: false });
    await expect(fetchGoogleUser(googleConfig()!, "c", "v", "https://x/cb", fetchImpl)).rejects.toThrow("尚未驗證");
  });

  it("Google 拒絕授權碼時給出可讀的錯誤", async () => {
    const { fetchImpl } = fakeGoogle({}, false);
    await expect(fetchGoogleUser(googleConfig()!, "c", "v", "https://x/cb", fetchImpl)).rejects.toThrow("Google");
  });
});

describe("登入流程的 routes", () => {
  it("開始登入：導去 Google，並把 state 存進只限 /api/auth 的短效 cookie", () => {
    const response = startLogin(request("/api/auth/google?next=%2Fscan"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).origin).toBe("https://accounts.google.com");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${OAUTH_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie).toContain("Path=/api/auth");
  });

  it("callback：state 對得上就發 session 並導回原本的頁面", async () => {
    vi.stubGlobal("fetch", fakeGoogle({ sub: "42", email: "a@b.c", email_verified: true, name: "小八" }).fetchImpl);
    const oauth = { ...newOAuthState("/scan") };
    const response = await callback(
      request(`/api/auth/callback/google?code=abc&state=${oauth.state}`, { [OAUTH_COOKIE]: sign(oauth, SECRET) }),
    );

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/scan");
    const sessionCookie = response.cookies.get(SESSION_COOKIE);
    expect(readSession(sessionCookie?.value, SECRET)?.id).toBe("g-42");
    expect(sessionCookie?.httpOnly).toBe(true);
    expect(sessionCookie?.secure).toBe(true);
  });

  it("callback：state 對不上（login CSRF）就拒絕，不發 session", async () => {
    const oauth = newOAuthState("/");
    const response = await callback(
      request("/api/auth/callback/google?code=abc&state=別人的", { [OAUTH_COOKIE]: sign(oauth, SECRET) }),
    );
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("callback：沒有 state cookie（逾時或直接打開網址）就拒絕", async () => {
    const response = await callback(request("/api/auth/callback/google?code=abc&state=x"));
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toContain("重新登入");
  });

  it("callback：state cookie 被竄改就拒絕", async () => {
    const oauth = newOAuthState("/");
    const response = await callback(
      request(`/api/auth/callback/google?code=abc&state=${oauth.state}`, { [OAUTH_COOKIE]: sign(oauth, "z".repeat(40)) }),
    );
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("callback：使用者在 Google 按取消", async () => {
    const response = await callback(request("/api/auth/callback/google?error=access_denied"));
    expect(new URL(response.headers.get("location")!).searchParams.get("error")).toContain("取消");
  });

  it("state cookie 裡的導回路徑也會再檢查一次", () => {
    const token = sign({ state: "s", verifier: "v", next: "//evil.example" }, SECRET);
    expect(readOAuthState(token, SECRET)?.next).toBe("/");
  });

  it("登出清掉 session cookie", async () => {
    const cookie = (await logoutRoute()).headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=;`);
    expect(cookie).toMatch(/max-age=0/i);
  });
});

describe("safeNextPath", () => {
  it("站內路徑原樣保留", () => {
    expect(safeNextPath("/item/abc?x=1")).toBe("/item/abc?x=1");
  });

  it("拒絕站外與協定相對網址，避免開放式轉址", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", undefined]) {
      expect(safeNextPath(value)).toBe("/");
    }
  });

  it("不導回登入頁或 API，避免繞圈", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/api/auth/google")).toBe("/");
  });
});

describe("proxy", () => {
  const session = () => ({ [SESSION_COOKIE]: signSession(USER, SECRET) });

  it("沒登入打開頁面時導到登入頁，並記住原本要去哪", () => {
    const response = proxy(request("/item/abc"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/item/abc");
  });

  it("沒登入呼叫 API 時回 401 JSON", async () => {
    const response = proxy(request("/api/items"));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toContain("登入");
  });

  it("帶著有效的 session 就放行", () => {
    expect(proxy(request("/api/items", session())).headers.get("x-middleware-next")).toBe("1");
  });

  it("登入流程與 PWA 檔案不需要登入", () => {
    for (const path of ["/login", "/api/auth/google", "/api/auth/callback/google", "/api/auth/logout", "/manifest.webmanifest", "/sw.js", "/icons/icon-192.png"]) {
      expect(proxy(request(path)).headers.get("x-middleware-next")).toBe("1");
    }
  });

  it("正式環境沒設定時，API 回 503、頁面導到說明頁", () => {
    clearAuthEnv();
    expect(proxy(request("/api/items")).status).toBe(503);
    expect(new URL(proxy(request("/")).headers.get("location")!).pathname).toBe("/login");
  });
});
