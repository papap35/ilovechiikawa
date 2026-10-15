import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import type { CollectionItem } from "../plush/schema";
import {
  serialize,
  StorageConflictError,
  toRows,
  type StorageDriver,
  type StorageSnapshot,
} from "./driver";

const BLOB_PATH = "collection.json";

/**
 * Vercel Blob 驅動。
 *
 * 三個關鍵設定：
 * - `access: "private"`：收藏庫含照片，不能放在任何人拿到網址就能開的位置。
 * - `useCache: false`：讀取時繞過 CDN 快取。否則剛寫完馬上讀會拿到舊版本。
 * - `ifMatch`：以 ETag 做條件寫入，兩個分頁同時修改時後者會收到衝突而不是
 *   默默蓋掉前者的修改（read-modify-write 的 lost update）。
 */
export function createVercelBlobDriver(): StorageDriver {
  const token = () => process.env.BLOB_READ_WRITE_TOKEN;

  return {
    name: "vercel-blob",

    async read(): Promise<StorageSnapshot> {
      const result = await get(BLOB_PATH, {
        access: "private",
        useCache: false,
        token: token(),
      });

      // 尚未建立過收藏庫
      if (!result || result.statusCode !== 200 || !result.stream) {
        return { rows: [], version: null };
      }

      const text = await new Response(result.stream).text();
      if (!text.trim()) return { rows: [], version: result.blob.etag ?? null };

      return { rows: toRows(JSON.parse(text)), version: result.blob.etag ?? null };
    },

    async write(items: CollectionItem[], expectedVersion: string | null): Promise<void> {
      try {
        await put(BLOB_PATH, serialize(items), {
          access: "private",
          contentType: "application/json",
          addRandomSuffix: false,
          allowOverwrite: true,
          token: token(),
          // 第一次寫入（還沒有版本）就不加條件，否則永遠建不出來
          ...(expectedVersion ? { ifMatch: expectedVersion } : {}),
        });
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError || (error as Error)?.name === "BlobPreconditionFailedError") {
          throw new StorageConflictError();
        }
        throw error;
      }
    },
  };
}
