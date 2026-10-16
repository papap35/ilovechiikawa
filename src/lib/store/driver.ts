/**
 * 持久化驅動。
 *
 * 每個使用者的收藏庫在概念上都是「一份 JSON 文件」，所以驅動只需要會
 * 依 key 讀整份、寫整份。上層的 store 負責決定 key（每人一份）、驗證與商業邏輯，
 * 跟儲存位置無關。
 *
 * 之所以要有這層，是因為本機開發寫檔案最方便，但 Vercel 的
 * serverless 檔案系統是唯讀的（除了 ephemeral 的 /tmp），
 * 直接寫檔會噴 EROFS，收藏庫永遠存不進去。
 */
export interface StorageDriver {
  /** 驅動名稱，用於診斷端點與錯誤訊息。 */
  readonly name: string;
  /** 讀取一份文件。不存在時 data 為 null。 */
  read(key: string): Promise<StorageSnapshot>;
  /**
   * 覆寫一份文件。
   *
   * expectedVersion 是 read() 當下的版本標記，用來做樂觀鎖：
   * 若期間有別人寫過，必須丟出 StorageConflictError 而不是覆蓋掉對方的修改。
   * 不支援條件寫入的驅動可以忽略它。
   */
  write(key: string, data: unknown, expectedVersion: string | null): Promise<void>;
}

export interface StorageSnapshot {
  /** 尚未驗證的原始資料；文件不存在時為 null。 */
  data: unknown;
  /** 版本標記（例如 ETag）。不支援樂觀鎖的驅動回傳 null。 */
  version: string | null;
}

/** 寫入時發現資料已被別人改過。上層應重讀後重試。 */
export class StorageConflictError extends Error {
  constructor() {
    super("資料在這次修改期間被其他請求改過了");
    this.name = "StorageConflictError";
  }
}

/**
 * 判斷是不是寫入衝突。
 *
 * 刻意不用 instanceof：打包器有可能讓同一個模組存在多份實例，
 * 那時類別身分會對不起來，重試邏輯就會默默失效（衝突直接往上拋，
 * 使用者的修改就丟了）。認 name 不依賴類別身分。
 */
export function isStorageConflictError(error: unknown): error is StorageConflictError {
  return error instanceof Error && error.name === "StorageConflictError";
}

/**
 * 文件 key 只允許小寫英數、底線、連字號、點與斜線，且不得含 `..`。
 *
 * key 裡帶著使用者 id，這道檢查確保不管 id 從哪裡來，
 * 都不可能組出跳出資料目錄的路徑。
 */
export function assertSafeKey(key: string): void {
  if (!/^[a-z0-9_./-]+\.json$/.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error(`不合法的儲存路徑：${key}`);
  }
}

export function serialize(data: unknown): string {
  return JSON.stringify(data, null, 2);
}
