"use client";

import Link from "next/link";
import { useState } from "react";
import type { AuthMode } from "@/lib/auth";

export function LoginClient({ mode, next }: { mode: AuthMode; next: string }) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "登入失敗");
      // 整頁跳轉而不是 router.push：讓帶著新 cookie 的請求重新經過伺服器端檢查
      window.location.assign(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "登入失敗");
      setSubmitting(false);
    }
  };

  return (
    <main className="login">
      <section className="panel">
        <h2>登入</h2>

        {mode === "misconfigured" ? (
          <div className="notice notice-warn" style={{ marginBottom: 0 }}>
            <strong>尚未設定存取密碼</strong>
            ：為了不讓收藏庫對外公開，伺服器在設定密碼之前不會提供任何資料。
            請在部署平台的環境變數加上 <code>CHIIKAWA_PASSWORD</code> 後重新部署。
          </div>
        ) : mode === "open" ? (
          <div className="notice notice-info" style={{ marginBottom: 0 }}>
            目前是開發環境且沒有設定 <code>CHIIKAWA_PASSWORD</code>，不需要登入。
            <Link href="/" style={{ textDecoration: "underline", marginLeft: 6 }}>
              回收藏庫
            </Link>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)}>
            {error && <div className="notice notice-error">{error}</div>}
            <div className="field">
              <label htmlFor="password">密碼</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitting || !password}>
              {submitting && <span className="spinner" />}
              {submitting ? "登入中…" : "登入"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
