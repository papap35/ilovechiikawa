import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { resetDriverCache } from "@/lib/store";
import {
  DEFAULT_DAILY_LIMIT,
  dailyLimit,
  quotaDate,
  quotaStatus,
  refundIdentify,
  reserveIdentify,
} from "@/lib/quota";
import type { SessionUser } from "@/lib/auth";

let dir: string;
const user: SessionUser = { id: "g-1", email: "hachiware@example.com", name: "小八", picture: null };
const other: SessionUser = { id: "g-2", email: "usagi@example.com", name: "烏薩奇", picture: null };
const noon = new Date("2026-10-16T04:00:00Z"); // 台灣中午

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "chiikawa-quota-"));
  vi.stubEnv("CHIIKAWA_DATA_DIR", dir);
  vi.stubEnv("CHIIKAWA_AI_DAILY_LIMIT", "3");
  resetDriverCache();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("每日額度", () => {
  it("額度內可以預約，用完就拒絕且不再加次數", async () => {
    for (let i = 0; i < 3; i += 1) expect(await reserveIdentify(user, noon)).not.toBeNull();
    expect(await reserveIdentify(user, noon)).toBeNull();
    expect(await quotaStatus(user, noon)).toEqual({ limit: 3, used: 3, remaining: 0 });
  });

  it("失敗時退還，退還不會讓次數變負的", async () => {
    await reserveIdentify(user, noon);
    await refundIdentify(user, noon);
    await refundIdentify(user, noon);
    expect((await quotaStatus(user, noon)).used).toBe(0);
  });

  it("每個人的額度分開算", async () => {
    for (let i = 0; i < 3; i += 1) await reserveIdentify(user, noon);
    expect(await reserveIdentify(other, noon)).not.toBeNull();
  });

  it("台灣時間換日就重置", async () => {
    for (let i = 0; i < 3; i += 1) await reserveIdentify(user, noon);
    const nextMorning = new Date("2026-10-16T16:30:00Z"); // 台灣 10/17 00:30
    expect(quotaDate(nextMorning)).toBe("2026-10-17");
    expect(await reserveIdentify(user, nextMorning)).not.toBeNull();
  });

  it("管理員不受限制", async () => {
    vi.stubEnv("CHIIKAWA_ADMIN_EMAILS", " Someone@else.com , HACHIWARE@example.com ");
    for (let i = 0; i < 5; i += 1) expect(await reserveIdentify(user, noon)).not.toBeNull();
    expect((await quotaStatus(user, noon)).remaining).toBeNull();
  });

  it("沒設定或設錯時用預設值，設 0 代表完全不開放", () => {
    vi.stubEnv("CHIIKAWA_AI_DAILY_LIMIT", "");
    expect(dailyLimit()).toBe(DEFAULT_DAILY_LIMIT);
    vi.stubEnv("CHIIKAWA_AI_DAILY_LIMIT", "很多");
    expect(dailyLimit()).toBe(DEFAULT_DAILY_LIMIT);
    vi.stubEnv("CHIIKAWA_AI_DAILY_LIMIT", "0");
    expect(dailyLimit()).toBe(0);
  });
});
