import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * 存取控制：Google 登入。
 *
 * 任何 Google 帳號都能登入，每個人只看得到、改得到自己的收藏。
 * 登入狀態放在一個簽章過的 cookie 裡（使用者 id、email、名稱與到期時間），
 * 伺服器不需要存 session——serverless 也適用，換 AUTH_SECRET 就等於讓所有人登出。
 *
 * 這個檔案只用 node:crypto，不碰 next/headers，proxy 與 route 都能直接引用。
 */

export const SESSION_COOKIE = "chiikawa_session";
export const OAUTH_COOKIE = "chiikawa_oauth";

/** 登入有效期：30 天。手機上的 PWA 不該每週都要重新登入。 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
/** 從按下登入到 Google 導回來的時限。 */
export const OAUTH_MAX_AGE_SECONDS = 60 * 10;

/** HMAC 金鑰至少要這麼長，太短的密鑰等於沒有簽章。 */
const MIN_SECRET_LENGTH = 32;

export interface SessionUser {
  /** 儲存路徑用的使用者 id（小寫英數與連字號） */
  id: string;
  email: string;
  name: string;
  picture: string | null;
}

/** 本機開發不設定 Google 時的使用者，收藏庫沿用 data/collection.json。 */
export const LOCAL_USER: SessionUser = {
  id: "local",
  email: "local@localhost",
  name: "本機使用者",
  picture: null,
};

export type AuthMode =
  /** Google 登入已設定 */
  | "google"
  /** 沒有設定的開發環境：不設防，所有請求都當作本機使用者 */
  | "open"
  /** 正式環境卻沒設定好：一律擋下，而不是默默對外公開 */
  | "misconfigured";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  secret: string;
}

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const secret = process.env.AUTH_SECRET?.trim();
  if (!clientId || !clientSecret || !secret || secret.length < MIN_SECRET_LENGTH) return null;
  return { clientId, clientSecret, secret };
}

/** 有沒有設定任何一個登入相關的變數。用來分辨「沒打算設定」與「設定到一半」。 */
function anyAuthEnvSet(): boolean {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AUTH_SECRET"].some((key) => Boolean(process.env[key]?.trim()));
}

export function authMode(): AuthMode {
  if (googleConfig()) return "google";
  // 設定到一半（例如 AUTH_SECRET 太短）在任何環境都不該默默放行
  if (anyAuthEnvSet()) return "misconfigured";
  return process.env.NODE_ENV === "production" ? "misconfigured" : "open";
}

/* ------------------------------------------------------------------ */
/* 簽章 */

function hmac(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/** 長度不同時 timingSafeEqual 會丟例外，所以先比長度。 */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** 把一個物件簽成 `payload.signature`。payload 是 base64url 的 JSON，可讀但不可竄改。 */
export function sign(value: object, secret: string): string {
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${hmac(secret, payload)}`;
}

export function unsign(token: string | null | undefined, secret: string): unknown {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  if (!safeEqual(token.slice(dot + 1), hmac(secret, payload))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Session */

interface SessionPayload extends SessionUser {
  /** 到期時間（epoch 秒） */
  exp: number;
}

export function signSession(user: SessionUser, secret: string, now = new Date()): string {
  const payload: SessionPayload = { ...user, exp: Math.floor(now.getTime() / 1000) + SESSION_MAX_AGE_SECONDS };
  return sign(payload, secret);
}

export function readSession(token: string | null | undefined, secret: string, now = new Date()): SessionUser | null {
  const value = unsign(token, secret) as Partial<SessionPayload> | null;
  if (!value || typeof value !== "object") return null;
  if (typeof value.exp !== "number" || value.exp * 1000 <= now.getTime()) return null;
  if (typeof value.id !== "string" || !/^[a-z0-9-]{1,64}$/.test(value.id)) return null;
  if (typeof value.email !== "string") return null;
  return {
    id: value.id,
    email: value.email,
    name: typeof value.name === "string" ? value.name : value.email,
    picture: typeof value.picture === "string" ? value.picture : null,
  };
}

/** 依目前的模式，從 session cookie 的值解出使用者。 */
export function userFromSessionCookie(value: string | null | undefined, now = new Date()): SessionUser | null {
  const mode = authMode();
  if (mode === "open") return LOCAL_USER;
  if (mode === "misconfigured") return null;
  return readSession(value, googleConfig()!.secret, now);
}

/** 從原始 Cookie 標頭取出某個 cookie。Route handler 拿到的是標準 Request，不是 NextRequest。 */
export function cookieFromHeader(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

/** Route handler 用：從請求解出目前的使用者，沒登入時為 null。 */
export function userFromRequest(request: Request): SessionUser | null {
  return userFromSessionCookie(cookieFromHeader(request.headers.get("cookie"), SESSION_COOKIE));
}

/* ------------------------------------------------------------------ */
/* Google OAuth（Authorization Code + PKCE） */

export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** Google 導回來的網址。必須和 Google Cloud Console 裡登記的完全一致。 */
export function googleRedirectUri(origin: string): string {
  return new URL("/api/auth/callback/google", origin).toString();
}

export interface OAuthState {
  state: string;
  verifier: string;
  next: string;
}

export function newOAuthState(next: string): OAuthState {
  return {
    state: randomBytes(16).toString("base64url"),
    verifier: randomBytes(32).toString("base64url"),
    next: safeNextPath(next),
  };
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function googleAuthorizeUrl(config: GoogleConfig, redirectUri: string, oauth: OAuthState): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", oauth.state);
  url.searchParams.set("code_challenge", pkceChallenge(oauth.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export function readOAuthState(token: string | null | undefined, secret: string): OAuthState | null {
  const value = unsign(token, secret) as Partial<OAuthState> | null;
  if (!value || typeof value.state !== "string" || typeof value.verifier !== "string") return null;
  return { state: value.state, verifier: value.verifier, next: safeNextPath(value.next) };
}

/**
 * Google 的 sub 是穩定、不會被回收的帳號 id（一串數字），拿來當儲存路徑。
 * 不用 email：使用者改 email 不該讓收藏庫消失。
 */
export function userIdFromGoogleSub(sub: string): string {
  if (/^\d{1,40}$/.test(sub)) return `g-${sub}`;
  // 理論上不會發生；萬一格式不同，雜湊成固定長度的安全字元
  return `g-${createHash("sha256").update(sub).digest("hex").slice(0, 40)}`;
}

export class GoogleLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleLoginError";
  }
}

/**
 * 用授權碼換 access token，再向 Google 取使用者資料。
 *
 * 這兩個請求都是伺服器直接對 Google 的 https 端點發出、帶著 client secret，
 * 所以回來的使用者資料可以直接採信，不需要另外驗 id_token 的簽章。
 */
export async function fetchGoogleUser(
  config: GoogleConfig,
  code: string,
  verifier: string,
  redirectUri: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SessionUser> {
  const tokenResponse = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!tokenResponse.ok) throw new GoogleLoginError("Google 拒絕了這次登入，請再試一次。");
  const { access_token: accessToken } = (await tokenResponse.json()) as { access_token?: string };
  if (!accessToken) throw new GoogleLoginError("Google 沒有回傳登入憑證，請再試一次。");

  const infoResponse = await fetchImpl(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!infoResponse.ok) throw new GoogleLoginError("無法取得 Google 帳號資料，請再試一次。");
  const info = (await infoResponse.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!info.sub || !info.email) throw new GoogleLoginError("Google 帳號缺少必要資料。");
  if (info.email_verified !== true) throw new GoogleLoginError("這個 Google 帳號的 email 尚未驗證。");

  return {
    id: userIdFromGoogleSub(info.sub),
    email: info.email,
    name: info.name?.trim() || info.email,
    picture: info.picture ?? null,
  };
}

/* ------------------------------------------------------------------ */

/**
 * 登入後要導回的路徑。只接受站內的絕對路徑，
 * 避免 `?next=//evil.example` 這種開放式轉址。
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.startsWith("/login") || value.startsWith("/api/")) return "/";
  return value;
}
