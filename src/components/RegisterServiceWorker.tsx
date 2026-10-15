"use client";

import { useEffect } from "react";

/** 註冊 service worker，讓收藏庫在沒有網路時也打得開。 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("service worker 註冊失敗", error);
    });
  }, []);

  return null;
}
