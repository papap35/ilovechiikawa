import { mutateDocument, readDocument, userDocumentKey } from "./store";
import type { SessionUser } from "./auth";

/**
 * AI 鑑定的每日額度。
 *
 * 每次辨識都會花站長的 Anthropic 額度，開放所有 Google 帳號登入之後，
 * 不能讓任何一個人無限制地刷。額度以台灣時間的日期計算，每天午夜重置。
 *
 * 做法是「先預約、失敗再退還」：在呼叫 API 之前就把次數加上去，
 * 同時開十個分頁送出也不會超過上限；辨識失敗時再把那一次退回來。
 */

export const DEFAULT_DAILY_LIMIT = 10;

const TIME_ZONE = "Asia/Taipei";

interface UsageDoc {
  date: string;
  count: number;
}

export interface QuotaStatus {
  /** null 代表不限次數（管理員） */
  limit: number | null;
  used: number;
  remaining: number | null;
}

export function dailyLimit(): number {
  const raw = process.env.CHIIKAWA_AI_DAILY_LIMIT;
  if (raw === undefined || raw.trim() === "") return DEFAULT_DAILY_LIMIT;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_LIMIT;
}

/** 不受每日額度限制的帳號（通常是站長自己），以逗號分隔的 email。 */
export function isAdmin(user: SessionUser): boolean {
  const admins = (process.env.CHIIKAWA_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  return admins.includes(user.email.toLowerCase());
}

/** 台灣時間的今天，格式 YYYY-MM-DD。 */
export function quotaDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function parseUsage(data: unknown, today: string): UsageDoc {
  const doc = data as Partial<UsageDoc> | null;
  // 換日了，或檔案格式不對，就從零開始
  if (!doc || doc.date !== today || typeof doc.count !== "number" || doc.count < 0) {
    return { date: today, count: 0 };
  }
  return { date: today, count: doc.count };
}

function status(user: SessionUser, used: number): QuotaStatus {
  if (isAdmin(user)) return { limit: null, used, remaining: null };
  const limit = dailyLimit();
  return { limit, used, remaining: Math.max(0, limit - used) };
}

export async function quotaStatus(user: SessionUser, now = new Date()): Promise<QuotaStatus> {
  const today = quotaDate(now);
  const doc = await readDocument(userDocumentKey(user.id, "usage"), (data) => parseUsage(data, today));
  return status(user, doc.count);
}

/**
 * 預約一次辨識。額度用完時回傳 null，不會加次數。
 */
export async function reserveIdentify(user: SessionUser, now = new Date()): Promise<QuotaStatus | null> {
  const today = quotaDate(now);
  const admin = isAdmin(user);
  const limit = dailyLimit();

  return mutateDocument(
    userDocumentKey(user.id, "usage"),
    (data) => parseUsage(data, today),
    (doc) => {
      if (!admin && doc.count >= limit) return null;
      const next = { date: today, count: doc.count + 1 };
      return { doc: next, result: status(user, next.count) };
    },
  );
}

/** 辨識失敗時退還預約的那一次。 */
export async function refundIdentify(user: SessionUser, now = new Date()): Promise<void> {
  const today = quotaDate(now);
  await mutateDocument(
    userDocumentKey(user.id, "usage"),
    (data) => parseUsage(data, today),
    (doc) => (doc.count > 0 ? { doc: { date: today, count: doc.count - 1 }, result: null } : null),
  );
}
