import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { assertSafeKey, StorageConflictError, type StorageDriver } from "@/lib/store/driver";
import { createJsonFileDriver } from "@/lib/store/json-file-driver";
import { createVercelBlobDriver } from "@/lib/store/vercel-blob-driver";

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

describe("assertSafeKey", () => {
  it("接受一般的文件路徑", () => {
    expect(() => assertSafeKey("collection.json")).not.toThrow();
    expect(() => assertSafeKey("users/g-123/collection.json")).not.toThrow();
  });

  it("拒絕跳出資料目錄或格式怪異的路徑", () => {
    for (const key of ["../etc/passwd.json", "users/../../x.json", "/abs.json", "users/A/x.json", "x.txt", ""]) {
      expect(() => assertSafeKey(key)).toThrow();
    }
  });

  it("兩個驅動都會擋，不只是本機檔案", async () => {
    await expect(createJsonFileDriver().read("../x.json")).rejects.toThrow();
    await expect(createVercelBlobDriver().read("../x.json")).rejects.toThrow();
  });
});

describe("createJsonFileDriver", () => {
  it("文件不存在時回傳 null 而不是拋錯", async () => {
    expect(await createJsonFileDriver().read("collection.json")).toEqual({ data: null, version: null });
  });

  it("寫入後讀得回來，子目錄會自動建立", async () => {
    const driver = createJsonFileDriver();
    await driver.write("users/g-1/collection.json", [{ name: "小八" }], null);
    expect((await driver.read("users/g-1/collection.json")).data).toEqual([{ name: "小八" }]);
  });

  it("不同 key 互不影響", async () => {
    const driver = createJsonFileDriver();
    await driver.write("users/g-1/collection.json", ["a"], null);
    await driver.write("users/g-2/collection.json", ["b"], null);
    expect((await driver.read("users/g-1/collection.json")).data).toEqual(["a"]);
    expect((await driver.read("users/g-2/collection.json")).data).toEqual(["b"]);
  });

  it("寫入是原子的：不會留下半個檔案", async () => {
    await createJsonFileDriver().write("collection.json", [], null);
    // 暫存檔應該都被 rename 掉了，目錄裡只剩正式檔案
    expect(await fs.readdir(dir)).toEqual(["collection.json"]);
  });

  it("執行期改變資料目錄會立刻生效", async () => {
    const driver = createJsonFileDriver();
    await driver.write("collection.json", ["x"], null);

    const other = await fs.mkdtemp(path.join(os.tmpdir(), "chiikawa-driver-alt-"));
    process.env.CHIIKAWA_DATA_DIR = other;
    expect((await driver.read("collection.json")).data).toBeNull();
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
    stored: Map<string, unknown>;
  } {
    let remaining = conflictsBeforeSuccess;
    const driver = {
      name: "fake",
      writes: 0,
      stored: new Map<string, unknown>(),
      async read(key: string) {
        return { data: driver.stored.get(key) ?? null, version: `v${driver.writes}` };
      },
      async write(key: string, data: unknown) {
        driver.writes += 1;
        if (remaining > 0) {
          remaining -= 1;
          throw new StorageConflictError();
        }
        driver.stored.set(key, data);
      },
    };
    return driver;
  }

  async function storeWith(driver: StorageDriver) {
    vi.resetModules();
    vi.doMock("@/lib/store/json-file-driver", () => ({ createJsonFileDriver: () => driver }));
    const store = await import("@/lib/store");
    store.resetDriverCache();
    return store;
  }

  afterEach(() => {
    vi.doUnmock("@/lib/store/json-file-driver");
  });

  it("衝突一次後重讀重試，最終成功", async () => {
    const driver = makeConflictingDriver(1);
    const store = await storeWith(driver);
    const created = await store.createItem("g-1", { name: "重試測試" });

    expect(created.name).toBe("重試測試");
    expect(driver.writes).toBe(2); // 第一次衝突，第二次成功
    expect(driver.stored.get("users/g-1/collection.json")).toHaveLength(1);
  });

  it("持續衝突超過重試上限就往上拋，不會默默吃掉使用者的修改", async () => {
    const store = await storeWith(makeConflictingDriver(99));
    await expect(store.createItem("g-1", { name: "一直衝突" })).rejects.toThrow(StorageConflictError);
  });
});
