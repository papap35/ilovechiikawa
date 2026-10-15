import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { CollectionItem } from "../plush/schema";
import { serialize, toRows, type StorageDriver, type StorageSnapshot } from "./driver";

/**
 * 本機檔案驅動。
 *
 * 好處是整個收藏庫就是一個可以直接備份、帶著走的檔案，開發時也好檢查。
 * 沒有樂觀鎖（version 恆為 null）——本機單人使用不會有並行寫入問題。
 */
export function createJsonFileDriver(): StorageDriver {
  // 每次呼叫時才解析路徑，而不是在模組載入時就定案，
  // 這樣執行期修改 CHIIKAWA_DATA_DIR 會立刻生效，測試也才好隔離。
  const dataDir = () => process.env.CHIIKAWA_DATA_DIR ?? path.join(process.cwd(), "data");
  const dataFile = () => path.join(dataDir(), "collection.json");

  return {
    name: "json-file",

    async read(): Promise<StorageSnapshot> {
      try {
        const raw = await fs.readFile(dataFile(), "utf8");
        return { rows: toRows(JSON.parse(raw)), version: null };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { rows: [], version: null };
        }
        throw error;
      }
    },

    async write(items: CollectionItem[]): Promise<void> {
      const file = dataFile();
      await fs.mkdir(path.dirname(file), { recursive: true });
      // 先寫暫存檔再 rename，避免寫入過程中斷造成收藏庫毀損
      const tmp = `${file}.${randomUUID()}.tmp`;
      await fs.writeFile(tmp, serialize(items), "utf8");
      await fs.rename(tmp, file);
    },
  };
}
