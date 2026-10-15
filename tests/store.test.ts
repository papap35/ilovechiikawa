import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import * as store from "@/lib/store";
import { CollectionItemPatchSchema, pickProvided } from "@/lib/plush/schema";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "chiikawa-store-"));
  process.env.CHIIKAWA_DATA_DIR = dir;
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  delete process.env.CHIIKAWA_DATA_DIR;
});

describe("collection store", () => {
  it("收藏庫不存在時回傳空陣列而不是拋錯", async () => {
    expect(await store.listItems()).toEqual([]);
  });

  it("新增後可以讀回，並自動補上 id 與時間戳", async () => {
    const created = await store.createItem({ name: "GT-R", rarity: "A" });
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();

    const fetched = await store.getItem(created.id);
    expect(fetched?.name).toBe("GT-R");
    expect(fetched?.rarity).toBe("A");
  });

  it("更新會保留建立時間並推進更新時間", async () => {
    const created = await store.createItem({ name: "初版" });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const updated = await store.updateItem(created.id, { name: "改名後", quantity: 2 });
    expect(updated?.name).toBe("改名後");
    expect(updated?.quantity).toBe(2);
    expect(updated?.createdAt).toBe(created.createdAt);
    expect(updated?.updatedAt).not.toBe(created.updatedAt);
  });

  it("局部更新不會把沒送的欄位重設成預設值", async () => {
    const created = await store.createItem({
      name: "GT-R",
      series: "official_limited",
      rarity: "A",
      authenticity: "verified",
      purchasePriceTwd: 900,
      quantity: 3,
    });

    // 模擬只想改盒況的 PATCH：先驗證，再挑出「真的有送」的欄位
    const body = { tagCondition: "no_tag" };
    const parsed = CollectionItemPatchSchema.parse(body);
    const updated = await store.updateItem(created.id, pickProvided(parsed, body));

    expect(updated?.tagCondition).toBe("no_tag");
    // 這些都沒送，必須維持原值而不是掉回預設值
    expect(updated?.series).toBe("official_limited");
    expect(updated?.rarity).toBe("A");
    expect(updated?.authenticity).toBe("verified");
    expect(updated?.purchasePriceTwd).toBe(900);
    expect(updated?.quantity).toBe(3);
    expect(updated?.name).toBe("GT-R");
  });

  it("更新或刪除不存在的 id 回傳 null / false", async () => {
    expect(await store.updateItem("沒有這台", { name: "x" })).toBeNull();
    expect(await store.deleteItem("沒有這台")).toBe(false);
  });

  it("刪除後就查不到了", async () => {
    const created = await store.createItem({ name: "要刪的" });
    expect(await store.deleteItem(created.id)).toBe(true);
    expect(await store.getItem(created.id)).toBeNull();
    expect(await store.listItems()).toEqual([]);
  });

  it("列表依建立時間新到舊排序", async () => {
    const first = await store.createItem({ name: "先加的" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await store.createItem({ name: "後加的" });

    const items = await store.listItems();
    expect(items.map((i) => i.id)).toEqual([second.id, first.id]);
  });

  it("檔案裡有壞資料時跳過該筆，其餘照常讀出", async () => {
    const good = await store.createItem({ name: "正常的" });

    const file = path.join(dir, "collection.json");
    const rows = JSON.parse(await fs.readFile(file, "utf8"));
    rows.push({ id: "壞的", name: 123 }); // 型別錯誤且缺欄位
    await fs.writeFile(file, JSON.stringify(rows), "utf8");

    const items = await store.listItems();
    expect(items.map((i) => i.id)).toEqual([good.id]);
  });
});
