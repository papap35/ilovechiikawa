"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthMode } from "@/lib/auth";

export function SettingsClient({
  itemCount,
  driverName,
  driverLabel,
  authMode,
}: {
  itemCount: number;
  driverName: string;
  driverLabel: string;
  authMode: AuthMode;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);

  const runImport = async (file: File) => {
    setImporting(true);
    setMessage(null);
    try {
      const text = await file.text();
      const response = await fetch("/api/collection/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "匯入失敗");

      const skipped = data.skipped > 0 ? `，跳過 ${data.skipped} 筆格式不符的資料` : "";
      setMessage({ kind: "info", text: `已匯入 ${data.imported} 筆收藏${skipped}。` });
      router.refresh();
    } catch (cause) {
      setMessage({ kind: "error", text: cause instanceof Error ? cause.message : "匯入失敗" });
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  return (
    <main>
      <h1 className="page-title">資料與備份</h1>

      {message && (
        <div className={`notice notice-${message.kind === "error" ? "error" : "info"}`}>
          {message.text}
        </div>
      )}

      <section className="panel">
        <h2>目前的儲存位置</h2>
        <div className="factor-list">
          <div className="factor">
            <div>
              <div>{driverLabel}</div>
              <div className="why">
                {driverName === "vercel-blob"
                  ? "收藏庫存在 Vercel Blob，設為私有，只有帶著金鑰的伺服器端讀得到。"
                  : "收藏庫存在伺服器本機的 data/collection.json。"}
              </div>
            </div>
            <div className="mult">{itemCount} 筆</div>
          </div>
        </div>
        {driverName === "json-file" && (
          <p className="field-hint">
            注意：Vercel 之類的 serverless 平台檔案系統是唯讀的。若這個頁面在雲端上顯示
            「本機檔案」，代表 Blob 尚未連上，新增的收藏會存不進去——
            請確認環境變數 <code>BLOB_READ_WRITE_TOKEN</code> 已設定。
          </p>
        )}
      </section>

      <section className="panel">
        <h2>存取控制</h2>
        {authMode === "password" ? (
          <>
            <p className="panel-note">
              已設定存取密碼，沒登入的人打不開任何頁面，也讀寫不了收藏庫。
              更換 <code>CHIIKAWA_PASSWORD</code> 會讓所有已登入的裝置一起登出。
            </p>
            <button type="button" className="btn" onClick={() => void logout()}>
              登出這台裝置
            </button>
          </>
        ) : (
          <p className="field-hint" style={{ marginTop: 0 }}>
            尚未設定 <code>CHIIKAWA_PASSWORD</code>，目前任何人都能打開這個網站。
            本機開發不影響；部署到雲端前請務必設定，正式環境沒有密碼時會拒絕所有請求。
          </p>
        )}
      </section>

      <section className="panel">
        <h2>匯出</h2>
        <p className="panel-note">
          下載完整的收藏庫 JSON。格式與伺服器端使用的完全相同，
          可以直接當作本機的 <code>data/collection.json</code>，也能再匯入回來。
        </p>
        <a href="/api/collection/export" className="btn btn-primary" download>
          下載收藏庫（{itemCount} 筆）
        </a>
      </section>

      <section className="panel">
        <h2>匯入</h2>
        <p className="panel-note">
          從備份檔還原。<strong>這會覆蓋目前的收藏庫</strong>，建議先匯出一份再操作。
          格式不符的資料列會被跳過並回報筆數，不會讓整批匯入失敗。
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (
              !window.confirm(
                `確定要用「${file.name}」覆蓋目前的 ${itemCount} 筆收藏？這個動作無法復原。`,
              )
            ) {
              event.target.value = "";
              return;
            }
            void runImport(file);
          }}
        />
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => fileInput.current?.click()}
          disabled={importing}
        >
          {importing && <span className="spinner" />}
          {importing ? "匯入中…" : "選擇備份檔並覆蓋"}
        </button>
      </section>
    </main>
  );
}
