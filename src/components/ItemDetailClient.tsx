"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CollectionItem } from "@/lib/plush/schema";
import type { CurrencyRates } from "@/lib/plush/channels";
import { ItemForm, type ItemFormValues } from "./ItemForm";

function toFormValues(item: CollectionItem): ItemFormValues {
  // 收藏品就是表單值加上 id 與時間戳，拿掉那三個欄位即可
  const { id, createdAt, updatedAt, ...values } = item;
  return values;
}

export function ItemDetailClient({
  item,
  rates,
}: {
  item: CollectionItem;
  rates: CurrencyRates;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ItemFormValues>(() => toFormValues(item));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "儲存失敗");
      setSavedAt(new Date().toLocaleTimeString("zh-TW"));
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`確定要從收藏庫刪除「${item.name}」？`)) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "刪除失敗");
      }
      router.push("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "刪除失敗");
      setSaving(false);
    }
  };

  return (
    <main>
      <div className="detail-nav">
        <Link href="/" style={{ fontSize: 13, color: "var(--text-dim)" }}>
          ← 回收藏庫
        </Link>
        <Link href={`/compare?ids=${item.id}`} className="btn btn-small">
          與其他玩偶比較
        </Link>
      </div>

      <h1 style={{ fontSize: 22, margin: "12px 0 16px", letterSpacing: "-0.02em" }}>{item.name}</h1>

      {error && <div className="notice notice-error">{error}</div>}
      {savedAt && !error && <div className="notice notice-info">已於 {savedAt} 儲存。</div>}

      {item.photo && (
        <div className="photo-strip">
          <figure style={{ width: 200, height: 150 }}>
            {/* 使用者照片為 data URL，不走 next/image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.photo} alt={item.name} />
          </figure>
        </div>
      )}

      <ItemForm
        values={values}
        onChange={setValues}
        rates={rates}
        submitLabel="儲存變更"
        onSubmit={() => void save()}
        submitting={saving}
        onDelete={() => void remove()}
      />
    </main>
  );
}
