import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import * as store from "@/lib/store";
import { CollectionItemPatchSchema, pickProvided } from "@/lib/plush/schema";

let dir: string;
const ME = "g-111";
const OTHER = "g-222";

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "chiikawa-store-"));
  process.env.CHIIKAWA_DATA_DIR = dir;
  store.resetDriverCache();
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  delete process.env.CHIIKAWA_DATA_DIR;
});

describe("collection store", () => {
  it("收藏庫不存在時回傳空陣列而不是拋錯", async () => {
    expect(await store.listItems(ME)).toEqual([]);
  });

  it("新增後可以讀回，並自動補上 id 與時間戳", async () => {
    const created = await store.createItem(ME, { name: "小八", rarity: "A" });
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();

    const fetched = await store.getItem(ME, created.id);
    expect(fetched?.name).toBe("小八");
    expect(fetched?.rarity).toBe("A");
  });

  it("更新會保留建立時間並推進更新時間", async () => {
    const created = await store.createItem(ME, { name: "初版" });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const updated = await store.updateItem(ME, created.id, { name: "改名後", quantity: 2 });
    expect(updated?.name).toBe("改名後");
    expect(updated?.quantity).toBe(2);
    expect(updated?.createdAt).toBe(created.createdAt);
    expect(updated?.updatedAt).not.toBe(created.updatedAt);
  });

  it("局部更新不會把沒送的欄位重設成預設值", async () => {
    const created = await store.createItem(ME, {
      name: "烏薩奇",
      series: "official_limited",
      rarity: "A",
      authenticity: "verified",
      purchasePriceTwd: 900,
      quantity: 3,
    });

    // 模擬只想改吊牌狀態的 PATCH：先驗證，再挑出「真的有送」的欄位
    const body = { tagCondition: "no_tag" };
    const parsed = CollectionItemPatchSchema.parse(body);
    const updated = await store.updateItem(ME, created.id, pickProvided(parsed, body));

    expect(updated?.tagCondition).toBe("no_tag");
    expect(updated?.series).toBe("official_limited");
    expect(updated?.rarity).toBe("A");
    expect(updated?.authenticity).toBe("verified");
    expect(updated?.purchasePriceTwd).toBe(900);
    expect(updated?.quantity).toBe(3);
  });

  it("更新或刪除不存在的 id 回傳 null / false", async () => {
    expect(await store.updateItem(ME, "沒有這隻", { name: "x" })).toBeNull();
    expect(await store.deleteItem(ME, "沒有這隻")).toBe(false);
  });

  it("刪除後就查不到了", async () => {
    const created = await store.createItem(ME, { name: "要刪的" });
    expect(await store.deleteItem(ME, created.id)).toBe(true);
    expect(await store.getItem(ME, created.id)).toBeNull();
  });

  it("列表依建立時間新到舊排序", async () => {
    const first = await store.createItem(ME, { name: "先加的" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await store.createItem(ME, { name: "後加的" });
    expect((await store.listItems(ME)).map((i) => i.id)).toEqual([second.id, first.id]);
  });

  it("檔案裡有壞資料時跳過該筆，其餘照常讀出", async () => {
    const good = await store.createItem(ME, { name: "正常的" });
    const file = path.join(dir, "users", ME, "collection.json");
    const rows = JSON.parse(await fs.readFile(file, "utf8"));
    rows.push({ id: "壞的", name: 123 });
    await fs.writeFile(file, JSON.stringify(rows), "utf8");

    expect((await store.listItems(ME)).map((i) => i.id)).toEqual([good.id]);
  });
});

describe("每個使用者各自一份收藏庫", () => {
  it("看不到別人的收藏", async () => {
    await store.createItem(ME, { name: "我的小八" });
    await store.createItem(OTHER, { name: "別人的烏薩奇" });

    expect((await store.listItems(ME)).map((i) => i.name)).toEqual(["我的小八"]);
    expect((await store.listItems(OTHER)).map((i) => i.name)).toEqual(["別人的烏薩奇"]);
  });

  it("拿到別人的 id 也讀不到、改不了、刪不掉", async () => {
    const theirs = await store.createItem(OTHER, { name: "別人的" });

    expect(await store.getItem(ME, theirs.id)).toBeNull();
    expect(await store.updateItem(ME, theirs.id, { name: "被我改掉" })).toBeNull();
    expect(await store.deleteItem(ME, theirs.id)).toBe(false);
    expect((await store.getItem(OTHER, theirs.id))?.name).toBe("別人的");
  });

  it("匯入只覆蓋自己的收藏庫", async () => {
    await store.createItem(OTHER, { name: "別人的" });
    await store.replaceAll(ME, []);
    expect(await store.listItems(OTHER)).toHaveLength(1);
  });

  it("本機使用者沿用舊路徑 data/collection.json，既有收藏不會消失", async () => {
    await fs.writeFile(
      path.join(dir, "collection.json"),
      JSON.stringify([{ id: "old", name: "舊收藏", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }]),
      "utf8",
    );
    expect((await store.listItems(store.LOCAL_USER_ID)).map((i) => i.name)).toEqual(["舊收藏"]);
  });

  it("不合法的使用者 id 直接拒絕，組不出危險路徑", async () => {
    for (const id of ["../x", "G-1", "a/b", ""]) {
      await expect(store.listItems(id)).rejects.toThrow();
    }
  });
});
