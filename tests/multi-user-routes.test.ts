import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { SESSION_COOKIE, signSession, type SessionUser } from "@/lib/auth";

/**
 * 以 Google 登入模式跑實際的 route，驗證兩個使用者彼此看不到、改不到對方的收藏，
 * 以及 AI 鑑定的每日額度確實在 route 上生效。
 */

const SECRET = "s".repeat(40);
const alice: SessionUser = { id: "g-1001", email: "alice@example.com", name: "Alice", picture: null };
const bob: SessionUser = { id: "g-2002", email: "bob@example.com", name: "Bob", picture: null };

const identifyPlush = vi.fn();
vi.mock("@/lib/ai/identify", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/identify")>();
  return { ...original, hasApiKey: () => true, identifyPlush: (...args: unknown[]) => identifyPlush(...args) };
});

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "chiikawa-multi-"));
  vi.stubEnv("CHIIKAWA_DATA_DIR", dir);
  vi.stubEnv("CHIIKAWA_STORAGE", "json");
  vi.stubEnv("GOOGLE_CLIENT_ID", "id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
  vi.stubEnv("AUTH_SECRET", SECRET);
  vi.stubEnv("CHIIKAWA_AI_DAILY_LIMIT", "2");
  const { resetDriverCache } = await import("@/lib/store");
  resetDriverCache();
  identifyPlush.mockReset();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

function as(user: SessionUser | null, url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (user) headers.set("cookie", `${SESSION_COOKIE}=${signSession(user, SECRET)}`);
  if (init.body) headers.set("Content-Type", "application/json");
  return new Request(url, { ...init, headers });
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe("收藏庫依使用者隔離", () => {
  it("沒登入的請求在 route 這層也會被拒絕（不只靠 proxy）", async () => {
    const { GET } = await import("@/app/api/items/route");
    expect((await GET(as(null, "http://x/api/items"))).status).toBe(401);
  });

  it("各自只看得到自己的收藏，也碰不到對方的", async () => {
    const items = await import("@/app/api/items/route");
    const one = await import("@/app/api/items/[id]/route");
    const exporter = await import("@/app/api/collection/export/route");

    const created = await items.POST(
      as(alice, "http://x/api/items", { method: "POST", body: JSON.stringify({ name: "Alice 的小八" }) }),
    );
    const aliceItem = (await created.json()).item;

    expect((await (await items.GET(as(bob, "http://x/api/items"))).json()).items).toEqual([]);
    expect((await one.GET(as(bob, "http://x"), params(aliceItem.id))).status).toBe(404);
    expect(
      (await one.PATCH(as(bob, "http://x", { method: "PATCH", body: JSON.stringify({ name: "被 Bob 改" }) }), params(aliceItem.id))).status,
    ).toBe(404);
    expect((await one.DELETE(as(bob, "http://x", { method: "DELETE" }), params(aliceItem.id))).status).toBe(404);
    expect(await (await exporter.GET(as(bob, "http://x"))).json()).toEqual([]);

    const mine = (await (await items.GET(as(alice, "http://x/api/items"))).json()).items;
    expect(mine.map((i: { name: string }) => i.name)).toEqual(["Alice 的小八"]);
  });

  it("匯入只覆蓋自己的收藏庫", async () => {
    const items = await import("@/app/api/items/route");
    const importer = await import("@/app/api/collection/import/route");
    await items.POST(as(alice, "http://x/api/items", { method: "POST", body: JSON.stringify({ name: "Alice 的" }) }));

    await importer.POST(as(bob, "http://x", { method: "POST", body: "[]" }));
    expect((await (await items.GET(as(alice, "http://x/api/items"))).json()).items).toHaveLength(1);
  });
});

describe("AI 鑑定的每日額度", () => {
  const image = JSON.stringify({ images: ["data:image/png;base64,AAAA"] });

  async function identify(user: SessionUser) {
    const { POST } = await import("@/app/api/identify/route");
    return POST(as(user, "http://x/api/identify", { method: "POST", body: image }));
  }

  it("用完額度後回 429，且不再呼叫 AI", async () => {
    const { mockIdentification } = await import("@/lib/ai/mock");
    identifyPlush.mockResolvedValue({ identification: mockIdentification(), mocked: false });

    expect((await identify(alice)).status).toBe(200);
    const second = await identify(alice);
    expect((await second.json()).quota).toEqual({ limit: 2, used: 2, remaining: 0 });

    const third = await identify(alice);
    expect(third.status).toBe(429);
    expect((await third.json()).error).toContain("手動建檔");
    expect(identifyPlush).toHaveBeenCalledTimes(2);

    // 別人的額度不受影響
    expect((await identify(bob)).status).toBe(200);
  });

  it("AI 呼叫失敗時退還額度", async () => {
    identifyPlush.mockRejectedValue(new Error("模型掛了"));
    expect((await identify(alice)).status).toBe(502);

    const { quotaStatus } = await import("@/lib/quota");
    expect((await quotaStatus(alice)).used).toBe(0);
  });

  it("照片格式錯誤的請求不會吃掉額度", async () => {
    const { POST } = await import("@/app/api/identify/route");
    const bad = await POST(
      as(alice, "http://x/api/identify", { method: "POST", body: JSON.stringify({ images: ["not-a-data-url"] }) }),
    );
    expect(bad.status).toBe(400);
    const { quotaStatus } = await import("@/lib/quota");
    expect((await quotaStatus(alice)).used).toBe(0);
  });
});
