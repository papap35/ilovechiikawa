import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { GET as listItemsRoute, POST as createItemRoute } from "@/app/api/items/route";
import { DELETE as deleteRoute, GET as getRoute, PATCH as patchRoute } from "@/app/api/items/[id]/route";
import { GET as statsRoute } from "@/app/api/stats/route";
import { GET as exportRoute } from "@/app/api/collection/export/route";
import { POST as importRoute } from "@/app/api/collection/import/route";
import { POST as identifyRoute } from "@/app/api/identify/route";
import { resetDriverCache } from "@/lib/store";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "chiikawa-api-"));
  process.env.CHIIKAWA_DATA_DIR = dir;
  process.env.CHIIKAWA_STORAGE = "json";
  resetDriverCache();
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  delete process.env.CHIIKAWA_DATA_DIR;
  delete process.env.CHIIKAWA_STORAGE;
  resetDriverCache();
});

const post = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const patch = (url: string, body: unknown) =>
  new Request(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

const get = (url: string) => new Request(url);

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function createSample(overrides: Record<string, unknown> = {}) {
  const response = await createItemRoute(
    post("http://x/api/items", { name: "測試玩偶", ...overrides }),
  );
  const data = await response.json();
  return data.item;
}

describe("POST /api/items", () => {
  it("建立成功時回 201 與完整的收藏品", async () => {
    const response = await createItemRoute(
      post("http://x/api/items", { name: "小八 S", series: "prize_regular" }),
    );
    expect(response.status).toBe(201);
    const { item } = await response.json();
    expect(item.id).toBeTruthy();
    expect(item.series).toBe("prize_regular");
  });

  it("名稱空白時回 400 與中文訊息", async () => {
    const response = await createItemRoute(post("http://x/api/items", { name: "" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("商品名稱");
  });

  it("body 不是合法 JSON 時回 400 而不是 500", async () => {
    const response = await createItemRoute(post("http://x/api/items", "{壞掉的 json"));
    expect(response.status).toBe(400);
  });

  it("不存在的產品線代號會被拒絕", async () => {
    const response = await createItemRoute(
      post("http://x/api/items", { name: "玩偶", series: "根本沒這條線" }),
    );
    expect(response.status).toBe(400);
  });
});

describe("GET /api/items", () => {
  it("空收藏庫回空陣列", async () => {
    expect((await (await listItemsRoute(get("http://x/api/items"))).json()).items).toEqual([]);
  });

  it("回傳已建立的收藏品", async () => {
    await createSample({ name: "第一隻" });
    const { items } = await (await listItemsRoute(get("http://x/api/items"))).json();
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("第一隻");
  });
});

describe("/api/items/[id]", () => {
  it("GET 找不到時回 404", async () => {
    const response = await getRoute(new Request("http://x"), params("不存在"));
    expect(response.status).toBe(404);
  });

  it("PATCH 只更新有送的欄位，其餘保持原值", async () => {
    const created = await createSample({
      series: "official_limited",
      rarity: "A",
      purchasePriceTwd: 900,
      quantity: 3,
    });

    const response = await patchRoute(
      patch(`http://x/api/items/${created.id}`, { tagCondition: "no_tag" }),
      params(created.id),
    );
    expect(response.status).toBe(200);

    const { item } = await response.json();
    expect(item.tagCondition).toBe("no_tag");
    expect(item.series).toBe("official_limited");
    expect(item.rarity).toBe("A");
    expect(item.purchasePriceTwd).toBe(900);
    expect(item.quantity).toBe(3);
  });

  it("PATCH 明確送 null 可以清空購入價", async () => {
    const created = await createSample({ purchasePriceTwd: 900 });
    const response = await patchRoute(
      patch(`http://x/api/items/${created.id}`, { purchasePriceTwd: null }),
      params(created.id),
    );
    expect((await response.json()).item.purchasePriceTwd).toBeNull();
  });

  it("PATCH 不存在的 id 回 404", async () => {
    const response = await patchRoute(
      patch("http://x/api/items/nope", { rarity: "S" }),
      params("nope"),
    );
    expect(response.status).toBe(404);
  });

  it("DELETE 成功後就查不到了", async () => {
    const created = await createSample();
    expect((await deleteRoute(new Request("http://x"), params(created.id))).status).toBe(200);
    expect((await getRoute(new Request("http://x"), params(created.id))).status).toBe(404);
  });

  it("DELETE 不存在的 id 回 404", async () => {
    expect((await deleteRoute(new Request("http://x"), params("nope"))).status).toBe(404);
  });
});

describe("GET /api/stats", () => {
  it("空收藏庫的統計是零而不是 NaN", async () => {
    const { stats } = await (await statsRoute(get("http://x/api/stats"))).json();
    expect(stats.totalItems).toBe(0);
    expect(stats.estimatedValueTwd).toBe(0);
  });

  it("統計會把數量計入總隻數", async () => {
    await createSample({ quantity: 3 });
    const { stats } = await (await statsRoute(get("http://x/api/stats"))).json();
    expect(stats.totalItems).toBe(1);
    expect(stats.totalUnits).toBe(3);
    expect(stats.byChannel).toHaveLength(1);
    expect(stats.byCharacter).toHaveLength(1);
  });
});

describe("匯出與匯入", () => {
  it("匯出帶著下載檔名與正確的 content type", async () => {
    await createSample({ name: "要匯出的" });
    const response = await exportRoute(get("http://x/api/collection/export"));
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Content-Disposition")).toContain("ilovechiikawa-");

    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("要匯出的");
  });

  it("匯出的內容可以原樣匯入回來", async () => {
    await createSample({ name: "來回一趟", rarity: "S" });
    const exported = await (await exportRoute(get("http://x/api/collection/export"))).text();

    // 先清空，再匯入
    await importRoute(post("http://x/api/collection/import", []));
    expect((await (await listItemsRoute(get("http://x/api/items"))).json()).items).toEqual([]);

    const response = await importRoute(post("http://x/api/collection/import", exported));
    expect((await response.json())).toEqual({ imported: 1, skipped: 0 });

    const { items } = await (await listItemsRoute(get("http://x/api/items"))).json();
    expect(items[0].name).toBe("來回一趟");
    expect(items[0].rarity).toBe("S");
  });

  it("匯入時跳過壞掉的資料列並回報數量，而不是整批拒絕", async () => {
    const mixed = [
      { id: "ok", name: "好的", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "bad", name: 12345 },
      "根本不是物件",
    ];
    const response = await importRoute(post("http://x/api/collection/import", mixed));
    expect(await response.json()).toEqual({ imported: 1, skipped: 2 });
  });

  it("匯入非陣列的 JSON 回 400", async () => {
    const response = await importRoute(post("http://x/api/collection/import", { 不是: "陣列" }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("陣列");
  });

  it("匯入壞掉的 JSON 回 400", async () => {
    const response = await importRoute(post("http://x/api/collection/import", "{壞掉"));
    expect(response.status).toBe(400);
  });
});

describe("POST /api/identify", () => {
  it("沒有照片時回 400", async () => {
    const response = await identifyRoute(post("http://x/api/identify", { images: [] }));
    expect(response.status).toBe(400);
  });

  it("不支援的圖片格式回 400", async () => {
    const response = await identifyRoute(
      post("http://x/api/identify", { images: ["data:image/svg+xml;base64,AAAA"] }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("格式");
  });

  it("超過張數上限回 400", async () => {
    const one = "data:image/png;base64,AAAA";
    const response = await identifyRoute(
      post("http://x/api/identify", { images: [one, one, one, one, one] }),
    );
    expect(response.status).toBe(400);
  });

  it("示範模式回傳辨識結果與可解釋的估值", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;

    const response = await identifyRoute(
      post("http://x/api/identify", { images: ["data:image/png;base64,AAAA"] }),
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.mocked).toBe(true);
    expect(data.identification.name).toBeTruthy();
    expect(data.valuation.midTwd).toBeGreaterThan(0);
    expect(data.valuation.factors.length).toBeGreaterThan(0);
  });
});
