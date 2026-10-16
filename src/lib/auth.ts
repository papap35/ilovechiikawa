import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * 存取控制：單一共用密碼。
 *
 * 這是個人收藏工具，不需要帳號系統，只需要「知道網址的陌生人進不來」。
 * 所以用一組密碼（環境變數 CHIIKAWA_PASSWORD）換一個簽章過的 cookie。
 *
 * cookie 的內容是以密碼為金鑰的 HMAC，不含密碼本身。好處是：
 * - 伺服器不需要存任何 session 狀態（serverless 也適用）
 * - 換密碼就等於讓所有已登入的裝置一起登出
 */

export const AUTH_COOKIE = "chiikawa_session";

/** 登入有效期：30 天。手機上的 PWA 不該每週都要重新輸入。 */
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const TOKEN_MESSAGE = "ilovechiikawa-session-v1";

export type AuthMode =
  /** 設了密碼：需要登入 */
  | "password"
  /** 沒設密碼的開發環境：不設防，方便本機開發 */
  | "open"
  /** 正式環境卻沒設密碼：一律擋下，而不是默默對外公開整個收藏庫 */
  | "misconfigured";

export function configuredPassword(): string | null {
  const value = process.env.CHIIKAWA_PASSWORD;
  return value && value.length > 0 ? value : null;
}

export function authMode(): AuthMode {
  if (configuredPassword()) return "password";
  return process.env.NODE_ENV === "production" ? "misconfigured" : "open";
}

export function sessionToken(password: string): string {
  return createHmac("sha256", password).update(TOKEN_MESSAGE).digest("base64url");
}

/** 長度不同時 timingSafeEqual 會丟例外，所以先比長度。 */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** 比對使用者輸入的密碼。兩邊都先做 HMAC 再比，讓比對時間與密碼內容無關。 */
export function verifyPassword(input: string): boolean {
  const password = configuredPassword();
  if (!password) return false;
  return safeEqual(sessionToken(input), sessionToken(password));
}

export function isValidSession(cookieValue: string | null | undefined): boolean {
  const password = configuredPassword();
  if (!password || !cookieValue) return false;
  return safeEqual(cookieValue, sessionToken(password));
}

/**
 * 登入後要導回的路徑。只接受站內的絕對路徑，
 * 避免 `?next=//evil.example` 這種開放式轉址。
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.startsWith("/login")) return "/";
  return value;
}
