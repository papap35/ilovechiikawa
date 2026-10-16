"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthMode, SessionUser } from "@/lib/auth";
import type { QuotaStatus } from "@/lib/quota";

export function SettingsClient({
  itemCount,
  driverName,
  driverLabel,
  authMode,
  user,
  quota,
}: {
  itemCount: number;
  driverName: string;
  driverLabel: string;
  authMode: AuthMode;
  user: SessionUser;
  /** 沒有 API 金鑰（示範模式）時不計額度，為 null */
  quota: QuotaStatus | null;
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
      <h1 className="page-title">帳號、資料與備份</h1>

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
                  ? "收藏庫存在 Vercel Blob，每個使用者一個檔案，設為私有，只有帶著金鑰的伺服器端讀得到。"
                  : "收藏庫存在伺服器本機的 data/ 目錄，每個使用者一個檔案。"}
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
        <h2>帳號</h2>
        {authMode === "google" ? (
          <div className="account">
            {user.picture && (
              // Google 頭像來自外部網址，不走 next/image 的最佳化設定
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.picture} alt="" className="avatar" referrerPolicy="no-referrer" />
            )}
            <div className="account-body">
              <div className="account-name">{user.name}</div>
              <div className="field-hint" style={{ margin: 0 }}>
                {user.email}・這裡的收藏只有你看得到
              </div>
            </div>
            <button type="button" className="btn" onClick={() => void logout()}>
              登出
            </button>
          </div>
        ) : (
          <p className="field-hint" style={{ marginTop: 0 }}>
            本機開發模式：尚未設定 Google 登入，所有請求都當作「本機使用者」。
            部署到雲端前請設定 <code>GOOGLE_CLIENT_ID</code>、<code>GOOGLE_CLIENT_SECRET</code> 與{" "}
            <code>AUTH_SECRET</code>，正式環境沒有設定時會拒絕所有請求。
          </p>
        )}
        {quota && (
          <p className="panel-note" style={{ margin: "14px 0 0" }}>
            {quota.limit === null
              ? `今天已使用 AI 鑑定 ${quota.used} 次（管理員不限次數）。`
              : `今天的 AI 鑑定：已用 ${quota.used} / ${quota.limit} 次，台灣時間午夜重置。`}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>匯出</h2>
        <p className="panel-note">
          下載你的完整收藏庫 JSON。格式與伺服器端使用的完全相同，
          可以直接當作本機的 <code>data/collection.json</code>，也能再匯入回來。
        </p>
        <a href="/api/collection/export" className="btn btn-primary" download>
          下載收藏庫（{itemCount} 筆）
        </a>
      </section>

      <section className="panel">
        <h2>匯入</h2>
        <p className="panel-note">
          從備份檔還原。<strong>這會覆蓋你目前的收藏庫</strong>（不影響其他人），建議先匯出一份再操作。
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
