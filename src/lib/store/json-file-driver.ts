import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { assertSafeKey, serialize, type StorageDriver, type StorageSnapshot } from "./driver";

/**
 * 本機檔案驅動。
 *
 * 好處是每份收藏庫就是一個可以直接備份、帶著走的檔案，開發時也好檢查。
 * 沒有樂觀鎖（version 恆為 null）——本機開發不會有並行寫入問題。
 */
export function createJsonFileDriver(): StorageDriver {
  // 每次呼叫時才解析路徑，而不是在模組載入時就定案，
  // 這樣執行期修改 CHIIKAWA_DATA_DIR 會立刻生效，測試也才好隔離。
  // turbopackIgnore：路徑裡帶著使用者 id，建置工具無法靜態判斷要讀哪些檔，
  // 不加的話會把整個專案目錄打包進 serverless 函式。
  const dataDir = () => process.env.CHIIKAWA_DATA_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), "data");
  const fileFor = (key: string) => {
    assertSafeKey(key);
    return path.join(dataDir(), key);
  };

  return {
    name: "json-file",

    async read(key: string): Promise<StorageSnapshot> {
      try {
        const raw = await fs.readFile(fileFor(key), "utf8");
        return { data: JSON.parse(raw), version: null };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { data: null, version: null };
        }
        throw error;
      }
    },

    async write(key: string, data: unknown): Promise<void> {
      const file = fileFor(key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      // 先寫暫存檔再 rename，避免寫入過程中斷造成收藏庫毀損
      const tmp = `${file}.${randomUUID()}.tmp`;
      await fs.writeFile(tmp, serialize(data), "utf8");
      await fs.rename(tmp, file);
    },
  };
}
