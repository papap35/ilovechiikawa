import Link from "next/link";
import type { AuthMode } from "@/lib/auth";

/** Google 的標準「G」標誌，依其品牌規範用於登入按鈕。 */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function LoginPanel({ mode, next, error }: { mode: AuthMode; next: string; error: string | null }) {
  const href = `/api/auth/google?next=${encodeURIComponent(next)}`;

  return (
    <main className="login">
      <section className="panel">
        <h2>登入</h2>

        {mode === "misconfigured" ? (
          <div className="notice notice-warn" style={{ marginBottom: 0 }}>
            <strong>Google 登入尚未設定完成</strong>
            ：為了不讓收藏庫對外公開，伺服器在設定好之前不會提供任何資料。
            請在部署平台的環境變數加上 <code>GOOGLE_CLIENT_ID</code>、<code>GOOGLE_CLIENT_SECRET</code> 與{" "}
            <code>AUTH_SECRET</code>（至少 32 個字元）後重新部署。
          </div>
        ) : mode === "open" ? (
          <div className="notice notice-info" style={{ marginBottom: 0 }}>
            目前是開發環境且沒有設定 Google 登入，不需要登入。
            <Link href="/" style={{ textDecoration: "underline", marginLeft: 6 }}>
              回收藏庫
            </Link>
          </div>
        ) : (
          <>
            {error && <div className="notice notice-error">{error}</div>}
            <p className="panel-note" style={{ margin: "0 0 16px" }}>
              用 Google 帳號登入後，你的收藏只有你自己看得到。
            </p>
            {/* 一般連結而不是 fetch：登入要整頁跳轉到 Google */}
            <a href={href} className="btn btn-google">
              <GoogleMark />
              使用 Google 帳號登入
            </a>
          </>
        )}
      </section>
    </main>
  );
}
