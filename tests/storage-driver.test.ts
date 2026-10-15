import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { StorageConflictError, type StorageDriver } from "@/lib/store/driver";
import { createJsonFileDriver } from "@/lib/store/json-file-driver";
import { CollectionItemSchema, type CollectionItem } from "@/lib/plush/schema";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "chiikawa-driver-"));
  process.env.CHIIKAWA_DATA_DIR = dir;
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
  delete process.env.CHIIKAWA_DATA_DIR;
  delete process.env.CHIIKAWA_STORAGE;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  vi.resetModules();
});

function item(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return CollectionItemSchema.parse({
    id: "a",
    name: "測試車",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("createJsonFileDriver", () => {
  it("檔案不存在時回傳空收藏庫而不是拋錯", async () => {
    const driver = createJsonFileDriver();
    expect(await driver.read()).toEqual({ rows: [], version: null });
  });

  it("寫入後讀得回來", async () => {
    const driver = createJsonFileDriver();
    await driver.write([item({ name: "GT-R" })], null);
    const snapshot = await driver.read();
    expect(snapshot.rows).toHaveLength(1);
    expect((snapshot.rows[0] as CollectionItem).name).toBe("GT-R");
  });

  it("檔案內容不是陣列時當作空收藏庫，而不是讓整個 app 掛掉", async () => {
    await fs.writeFile(path.join(dir, "collection.json"), '{"不是":"陣列"}', "utf8");
    expect((await createJsonFileDriver().read()).rows).toEqual([]);
  });

  it("寫入是原子的：不會留下半個檔案", async () => {
    const driver = createJsonFileDriver();
    await driver.write([item()], null);
    // 暫存檔應該都被 rename 掉了，目錄裡只剩正式檔案
    expect(await fs.readdir(dir)).toEqual(["collection.json"]);
  });

  it("執行期改變資料目錄會立刻生效", async () => {
    const driver = createJsonFileDriver();
    await driver.write([item()], null);

    const other = await fs.mkdtemp(path.join(os.tmpdir(), "chiikawa-driver-alt-"));
    process.env.CHIIKAWA_DATA_DIR = other;
    expect((await driver.read()).rows).toEqual([]);
    await fs.rm(other, { recursive: true, force: true });
  });
});

describe("selectDriver", () => {
  async function freshSelect() {
    vi.resetModules();
    const mod = await import("@/lib/store");
    mod.resetDriverCache();
    return mod.selectDriver;
  }

  it("沒有任何設定時用本機檔案", async () => {
    const selectDriver = await freshSelect();
    expect(selectDriver().name).toBe("json-file");
  });

  it("看到 Blob token 就自動改用 Blob，本機開發不需要任何設定", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_fake";
    const selectDriver = await freshSelect();
    expect(selectDriver().name).toBe("vercel-blob");
  });

  it("CHIIKAWA_STORAGE 可以覆寫自動偵測", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_fake";
    process.env.CHIIKAWA_STORAGE = "json";
    const selectDriver = await freshSelect();
    expect(selectDriver().name).toBe("json-file");
  });

  it("明確指定 blob 時即使沒有 token 也照用，讓設定錯誤現形而不是默默降級", async () => {
    process.env.CHIIKAWA_STORAGE = "blob";
    const selectDriver = await freshSelect();
    expect(selectDriver().name).toBe("vercel-blob");
  });
});

/**
 * 用假驅動驗證樂觀鎖的重試邏輯。
 * 真正的 Vercel Blob 需要憑證，但重試行為是我們自己的程式碼，可以獨立測。
 */
describe("寫入衝突的重試", () => {
  function makeConflictingDriver(conflictsBeforeSuccess: number): StorageDriver & {
    writes: number;
    stored: CollectionItem[];
  } {
    let remaining = conflictsBeforeSuccess;
    const driver = {
      name: "fake",
      writes: 0,
      stored: [] as CollectionItem[],
      async read() {
        return { rows: driver.stored, version: `v${driver.writes}` };
      },
      async write(items: CollectionItem[]) {
        driver.writes += 1;
        if (remaining > 0) {
          remaining -= 1;
          throw new StorageConflictError();
        }
        driver.stored = items;
      },
    };
    return driver;
  }

  it("衝突一次後重讀重試，最終成功", async () => {
    const driver = makeConflictingDriver(1);
    vi.resetModules();
    vi.doMock("@/lib/store/json-file-driver", () => ({
      createJsonFileDriver: () => driver,
    }));

    const store = await import("@/lib/store");
    store.resetDriverCache();
    const created = await store.createItem({ name: "重試測試" });

    expect(created.name).toBe("重試測試");
    expect(driver.writes).toBe(2); // 第一次衝突，第二次成功
    expect(driver.stored).toHaveLength(1);
    vi.doUnmock("@/lib/store/json-file-driver");
  });

  it("持續衝突超過重試上限就往上拋，不會默默吃掉使用者的修改", async () => {
    const driver = makeConflictingDriver(99);
    vi.resetModules();
    vi.doMock("@/lib/store/json-file-driver", () => ({
      createJsonFileDriver: () => driver,
    }));

    const store = await import("@/lib/store");
    store.resetDriverCache();
    await expect(store.createItem({ name: "一直衝突" })).rejects.toThrow(StorageConflictError);
    vi.doUnmock("@/lib/store/json-file-driver");
  });
});
