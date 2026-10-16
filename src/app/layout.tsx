import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";

export const metadata: Metadata = {
  title: "ilovechiikawa — 吉伊卡哇玩偶收藏管理",
  description: "拍照辨識角色、出處與真假，估算行情、跨出處比較，管理你的吉伊卡哇玩偶收藏。",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "ilovechiikawa" },
};

export const viewport: Viewport = {
  themeColor: "#fff8f1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <div className="app">
          <header className="masthead">
            <Link href="/" className="brand" aria-label="ilovechiikawa 首頁">
              <span className="mark" aria-hidden />
              <span className="brand-name">ilovechiikawa</span>
              <small>吉伊卡哇玩偶收藏 · AI 鑑定</small>
            </Link>
            <nav className="masthead-actions">
              <Link href="/settings" className="btn btn-icon" aria-label="帳號、資料與備份" title="帳號、資料與備份">
                資料
              </Link>
              <Link href="/compare" className="btn">
                比較
              </Link>
              <Link href="/scan" className="btn btn-primary">
                拍照鑑定
              </Link>
            </nav>
          </header>
          {children}
        </div>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
