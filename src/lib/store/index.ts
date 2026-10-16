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
 * 每個使用者各有一份收藏庫，所有函式都以 userId 為第一個參數——
 * 讀寫別人的收藏在型別上就不可能「忘了帶」。
 * 驗證與商業邏輯都在這裡，實際存到哪由驅動決定：
 * 本機寫檔案，部署到 Vercel 時寫 Blob（serverless 檔案系統唯讀）。
 */

/** 寫入衝突時的重試次數。單人使用幾乎不會用到，但兩個分頁同時改就會。 */
const MAX_WRITE_ATTEMPTS = 3;

/**
 * 本機開發不設登入時的使用者。
 *
 * 它的收藏庫沿用加入多人之前的路徑 data/collection.json，
 * 本機已經建檔的收藏不會因為改成多人而消失。
 */
export const LOCAL_USER_ID = "local";

/** 使用者 id 只允許小寫英數與連字號，確保組出來的儲存路徑安全。 */
export function assertUserId(userId: string): void {
  if (!/^[a-z0-9-]{1,64}$/.test(userId)) throw new Error(`不合法的使用者 id：${userId}`);
}

/** 某個使用者某份文件的儲存路徑。 */
export function userDocumentKey(userId: string, name: "collection" | "usage"): string {
  assertUserId(userId);
  return userId === LOCAL_USER_ID ? `${name}.json` : `users/${userId}/${name}.json`;
}

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
 * 讀出一份文件、套用一個修改、寫回去。
 *
 * 寫回時帶著讀取當下的版本標記，若期間被別人改過就重讀重試，
 * 而不是拿舊資料覆蓋掉對方的修改。apply 回傳 null 代表不需要寫入。
 */
export async function mutateDocument<D, T>(
  key: string,
  parse: (data: unknown) => D,
  apply: (doc: D) => { doc: D; result: T } | null,
): Promise<T | null> {
  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt += 1) {
    const { data, version } = await selectDriver().read(key);
    const outcome = apply(parse(data));
    if (outcome === null) return null;

    try {
      await selectDriver().write(key, outcome.doc, version);
      return outcome.result;
    } catch (error) {
      if (isStorageConflictError(error) && attempt < MAX_WRITE_ATTEMPTS) continue;
      throw error;
    }
  }
  throw new StorageConflictError();
}

export async function readDocument<D>(key: string, parse: (data: unknown) => D): Promise<D> {
  const { data } = await selectDriver().read(key);
  return parse(data);
}

/* ------------------------------------------------------------------ */

/**
 * 逐筆驗證原始資料列。
 * 手動編輯過的檔案不該讓整個 app 掛掉，壞掉的那筆跳過就好。
 */
function parseItems(data: unknown): CollectionItem[] {
  const rows = Array.isArray(data) ? data : [];
  return rows.flatMap((row) => {
    const result = CollectionItemSchema.safeParse(row);
    return result.success ? [result.data] : [];
  });
}

const collectionKey = (userId: string) => userDocumentKey(userId, "collection");

function mutate<T>(
  userId: string,
  apply: (items: CollectionItem[]) => { items: CollectionItem[]; result: T } | null,
): Promise<T | null> {
  return mutateDocument(collectionKey(userId), parseItems, (items) => {
    const outcome = apply(items);
    return outcome && { doc: outcome.items, result: outcome.result };
  });
}

export async function listItems(userId: string): Promise<CollectionItem[]> {
  const items = await readDocument(collectionKey(userId), parseItems);
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getItem(userId: string, id: string): Promise<CollectionItem | null> {
  const items = await readDocument(collectionKey(userId), parseItems);
  return items.find((item) => item.id === id) ?? null;
}

export async function createItem(userId: string, input: CollectionItemInput): Promise<CollectionItem> {
  const now = new Date().toISOString();
  const item = CollectionItemSchema.parse({
    ...input,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  });

  const created = await mutate(userId, (items) => ({ items: [...items, item], result: item }));
  // apply 永遠回傳非 null，所以這裡不會是 null
  return created as CollectionItem;
}

export async function updateItem(
  userId: string,
  id: string,
  patch: CollectionItemPatch,
): Promise<CollectionItem | null> {
  // 只覆寫實際有送來的欄位，沒送的維持原值
  const changes = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );

  return mutate(userId, (items) => {
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

export async function deleteItem(userId: string, id: string): Promise<boolean> {
  const deleted = await mutate(userId, (items) => {
    const remaining = items.filter((item) => item.id !== id);
    if (remaining.length === items.length) return null;
    return { items: remaining, result: true };
  });
  return deleted ?? false;
}

/** 匯入整份收藏庫，覆蓋這個使用者現有的內容。回傳成功匯入的筆數。 */
export async function replaceAll(userId: string, rows: unknown[]): Promise<number> {
  const items = parseItems(rows);
  await mutate(userId, () => ({ items, result: null }));
  return items.length;
}
