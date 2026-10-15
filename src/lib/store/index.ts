import { randomUUID } from "node:crypto";
import {
  CollectionItemSchema,
  type CollectionItem,
  type CollectionItemInput,
  type CollectionItemPatch,
} from "../plush/schema";
import { isStorageConflictError, StorageConflictError, type StorageDriver } from "./driver";
import { createJsonFileDriver } from "./json-file-driver";
import { createVercelBlobDriver } from "./vercel-blob-driver";

export { isStorageConflictError, StorageConflictError } from "./driver";
export type { StorageDriver } from "./driver";

/**
 * 收藏庫儲存層。
 *
 * 驗證與商業邏輯都在這裡，實際存到哪由驅動決定：
 * 本機寫檔案，部署到 Vercel 時寫 Blob（serverless 檔案系統唯讀）。
 */

/** 寫入衝突時的重試次數。單人使用幾乎不會用到，但兩個分頁同時改就會。 */
const MAX_WRITE_ATTEMPTS = 3;

let cachedDriver: StorageDriver | null = null;
let cachedDriverKey: string | null = null;

/**
 * 選擇驅動。
 *
 * 明確設定 CHIIKAWA_STORAGE 優先；否則看到 Vercel Blob 的 token 就用 Blob，
 * 都沒有就寫本機檔案。這樣本機開發不需要任何設定，部署到 Vercel 只要
 * 連上 Blob store（Vercel 會自動注入 BLOB_READ_WRITE_TOKEN）就會自動切換。
 */
export function selectDriver(): StorageDriver {
  const explicit = process.env.CHIIKAWA_STORAGE?.trim().toLowerCase();
  const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const key = `${explicit ?? ""}|${hasBlobToken}`;

  if (cachedDriver && cachedDriverKey === key) return cachedDriver;

  let driver: StorageDriver;
  if (explicit === "blob") {
    driver = createVercelBlobDriver();
  } else if (explicit === "json") {
    driver = createJsonFileDriver();
  } else if (hasBlobToken) {
    driver = createVercelBlobDriver();
  } else {
    driver = createJsonFileDriver();
  }

  cachedDriver = driver;
  cachedDriverKey = key;
  return driver;
}

/** 測試用：強制下次重新選擇驅動。 */
export function resetDriverCache(): void {
  cachedDriver = null;
  cachedDriverKey = null;
}

/**
 * 逐筆驗證原始資料列。
 * 手動編輯過的檔案不該讓整個 app 掛掉，壞掉的那筆跳過就好。
 */
function parseRows(rows: unknown[]): CollectionItem[] {
  return rows.flatMap((row) => {
    const result = CollectionItemSchema.safeParse(row);
    return result.success ? [result.data] : [];
  });
}

interface LoadedCollection {
  items: CollectionItem[];
  version: string | null;
}

async function load(): Promise<LoadedCollection> {
  const { rows, version } = await selectDriver().read();
  return { items: parseRows(rows), version };
}

/**
 * 讀出收藏庫、套用一個修改、寫回去。
 *
 * 寫回時帶著讀取當下的版本標記，若期間被別人改過就重讀重試，
 * 而不是拿舊資料覆蓋掉對方的修改。
 */
async function mutate<T>(
  apply: (items: CollectionItem[]) => { items: CollectionItem[]; result: T } | null,
): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const { items, version } = await load();
    const outcome = apply(items);
    if (outcome === null) return null;

    try {
      await selectDriver().write(outcome.items, version);
      return outcome.result;
    } catch (error) {
      if (isStorageConflictError(error) && attempt < MAX_WRITE_ATTEMPTS) continue;
      throw error;
    }
  }
  throw new StorageConflictError();
}

export async function listItems(): Promise<CollectionItem[]> {
  const { items } = await load();
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getItem(id: string): Promise<CollectionItem | null> {
  const { items } = await load();
  return items.find((item) => item.id === id) ?? null;
}

export async function createItem(input: CollectionItemInput): Promise<CollectionItem> {
  const now = new Date().toISOString();
  const item = CollectionItemSchema.parse({
    ...input,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  });

  const created = await mutate((items) => ({ items: [...items, item], result: item }));
  // apply 永遠回傳非 null，所以這裡不會是 null
  return created as CollectionItem;
}

export async function updateItem(
  id: string,
  patch: CollectionItemPatch,
): Promise<CollectionItem | null> {
  // 只覆寫實際有送來的欄位，沒送的維持原值
  const changes = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );

  return mutate((items) => {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return null;

    const updated = CollectionItemSchema.parse({
      ...items[index],
      ...changes,
      id,
      createdAt: items[index].createdAt,
      updatedAt: new Date().toISOString(),
    });

    const next = [...items];
    next[index] = updated;
    return { items: next, result: updated };
  });
}

export async function deleteItem(id: string): Promise<boolean> {
  const deleted = await mutate((items) => {
    const remaining = items.filter((item) => item.id !== id);
    if (remaining.length === items.length) return null;
    return { items: remaining, result: true };
  });
  return deleted ?? false;
}

/** 匯入整份收藏庫，覆蓋現有內容。回傳成功匯入的筆數。 */
export async function replaceAll(rows: unknown[]): Promise<number> {
  const items = parseRows(rows);

  await mutate(() => ({ items, result: null }));
  return items.length;
}
