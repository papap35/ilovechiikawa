import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import {
  assertSafeKey,
  serialize,
  StorageConflictError,
  type StorageDriver,
  type StorageSnapshot,
} from "./driver";

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

    async read(key: string): Promise<StorageSnapshot> {
      assertSafeKey(key);
      const result = await get(key, {
        access: "private",
        useCache: false,
        token: token(),
      });

      // 尚未建立過這份文件
      if (!result || result.statusCode !== 200 || !result.stream) {
        return { data: null, version: null };
      }

      const text = await new Response(result.stream).text();
      const version = result.blob.etag ?? null;
      if (!text.trim()) return { data: null, version };

      return { data: JSON.parse(text), version };
    },

    async write(key: string, data: unknown, expectedVersion: string | null): Promise<void> {
      assertSafeKey(key);
      try {
        await put(key, serialize(data), {
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
