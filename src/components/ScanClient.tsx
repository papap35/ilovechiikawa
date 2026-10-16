"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { fileToResizedDataUrl } from "@/lib/image";
import { emptyFormValues, ItemForm, type ItemFormValues } from "./ItemForm";
import type { Identification } from "@/lib/plush/schema";
import { getChannel, type CurrencyRates } from "@/lib/plush/channels";
import { getCharacter } from "@/lib/plush/characters";
import { percent } from "@/lib/format";
import type { QuotaStatus } from "@/lib/quota";

interface IdentifyResponse {
  identification: Identification;
  mocked: boolean;
  quota?: QuotaStatus | null;
  error?: string;
}

const MAX_PHOTOS = 4;

export function ScanClient({
  rates,
  apiKeyConfigured,
  initialQuota,
}: {
  rates: CurrencyRates;
  apiKeyConfigured: boolean;
  initialQuota: QuotaStatus | null;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<string[]>([]);
  const [identifying, setIdentifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Identification | null>(null);
  const [mocked, setMocked] = useState(false);
  const [values, setValues] = useState<ItemFormValues>(emptyFormValues);
  const [quota, setQuota] = useState<QuotaStatus | null>(initialQuota);
  const quotaExhausted = quota !== null && quota.remaining === 0;
  /** 不經過 AI、直接手動填表建檔。額度用完或想自己輸入時用。 */
  const [manual, setManual] = useState(false);

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    try {
      const room = MAX_PHOTOS - photos.length;
      const accepted = Array.from(files).slice(0, room);
      const dataUrls = await Promise.all(accepted.map(fileToResizedDataUrl));
      setPhotos((prev) => [...prev, ...dataUrls]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "照片讀取失敗");
    } finally {
      // 清空 input，讓同一個檔案可以再選一次
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const identify = async () => {
    if (photos.length === 0) return;
    setIdentifying(true);
    setError(null);
    try {
      const response = await fetch("/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: photos }),
      });
      const data = (await response.json()) as IdentifyResponse;
      if (response.status === 429) setQuota((prev) => prev && { ...prev, remaining: 0 });
      if (!response.ok) throw new Error(data.error ?? "辨識失敗");

      if (data.quota) setQuota(data.quota);
      const id = data.identification;
      setResult(id);
      setMocked(data.mocked);
      // 辨識結果直接填進表單，使用者可以逐項修正後再存
      setValues({
        ...emptyFormValues(),
        name: id.name,
        nameOriginal: id.nameOriginal,
        character: id.character,
        series: id.series,
        catalogNumber: id.catalogNumber,
        releaseYear: id.releaseYear > 0 ? id.releaseYear : null,
        discontinued: id.discontinued,
        isSpecialEdition: id.isSpecialEdition,
        size: id.size,
        authenticity: id.authenticity,
        condition: id.condition,
        tagCondition: id.tagCondition,
        rarity: id.rarity,
        photo: photos[0] ?? null,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "辨識失敗");
    } finally {
      setIdentifying(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, photo: values.photo ?? photos[0] ?? null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "儲存失敗");
      router.push(`/item/${data.item.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "儲存失敗");
      setSaving(false);
    }
  };

  const specialLabel = result ? getChannel(result.channel).specialVariant?.shortZh : null;

  return (
    <main>
      {!apiKeyConfigured && (
        <div className="notice notice-warn">
          <strong>示範模式</strong>
          ：尚未設定 <code>ANTHROPIC_API_KEY</code>，辨識會回傳一組固定的範例資料，
          用來展示完整流程。設定金鑰並重新啟動後即為真實辨識。
        </div>
      )}

      {error && <div className="notice notice-error">{error}</div>}

      <section className="panel">
        <h2>拍照 / 選擇照片</h2>
        <p style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.7, marginTop: 0 }}>
          最多 {MAX_PHOTOS} 張。想要準一點，建議拍這三個角度：
          <br />
          <strong>正面全身</strong>（臉部刺繡與造型，旁邊放手或常見物品當比例尺）、
          <strong>紙吊牌正反面</strong>（出處標示、賞別、JAN 條碼）、
          <strong>布標</strong>（版權標示與製造商）。
        </p>

        <div className="photo-strip">
          {photos.map((photo, index) => (
            <figure key={index}>
              {/* 使用者照片為 data URL，不走 next/image */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt={`照片 ${index + 1}`} />
              <button
                type="button"
                aria-label={`移除照片 ${index + 1}`}
                onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </figure>
          ))}
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(event) => void addFiles(event.target.files)}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn"
            onClick={() => fileInput.current?.click()}
            disabled={photos.length >= MAX_PHOTOS}
          >
            {photos.length === 0 ? "選擇照片" : `再加一張（${photos.length}/${MAX_PHOTOS}）`}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void identify()}
            disabled={photos.length === 0 || identifying || quotaExhausted}
          >
            {identifying && <span className="spinner" />}
            {identifying ? "鑑定中…" : "開始鑑定"}
          </button>
          {!result && !manual && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setManual(true);
                setValues({ ...emptyFormValues(), photo: photos[0] ?? null });
              }}
            >
              不用 AI，手動建檔
            </button>
          )}
        </div>
        {quota && quota.limit !== null && (
          <p className="field-hint" style={{ marginBottom: 0 }}>
            {quotaExhausted
              ? "今天的 AI 鑑定次數已經用完，台灣時間午夜後重置。這段期間可以按「不用 AI，手動建檔」。"
              : `今天還能 AI 鑑定 ${quota.remaining} 次（每天 ${quota.limit} 次）。`}
          </p>
        )}
      </section>

      {result && (
        <>
          <section className="panel">
            <h2>鑑定結果</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <span className="badge">{getCharacter(result.character).nameZh}</span>
              <span className="badge">{getChannel(result.channel).nameZh}</span>
              <span className={`badge badge-${result.rarity}`}>稀有度 {result.rarity}</span>
              {result.isSpecialEdition && specialLabel && (
                <span className="badge badge-special">{specialLabel}</span>
              )}
              {result.discontinued && <span className="badge">已停售</span>}
              <span className="badge">信心度 {percent(result.confidence)}</span>
              {mocked && <span className="badge badge-special">示範資料</span>}
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.75, margin: "0 0 12px" }}>{result.reasoningZh}</p>
            {result.authenticityFlagsZh.length > 0 && (
              <div className="notice notice-error">
                <strong>仿冒疑點</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                  {result.authenticityFlagsZh.map((flag, index) => (
                    <li key={index} style={{ marginBottom: 2 }}>
                      {flag}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.cautionsZh.length > 0 && (
              <div className="notice notice-info" style={{ marginBottom: 0 }}>
                <strong>需要你親自確認</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                  {result.cautionsZh.map((caution, index) => (
                    <li key={index} style={{ marginBottom: 2 }}>
                      {caution}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

        </>
      )}

      {(result || manual) && (
        <ItemForm
          values={values}
          onChange={setValues}
          rates={rates}
          submitLabel="加入收藏庫"
          onSubmit={() => void save()}
          submitting={saving}
        />
      )}
    </main>
  );
}
