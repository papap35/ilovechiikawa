"use client";

import { useMemo, useState } from "react";
import {
  defaultSeriesForChannel,
  getSeries,
  seriesForChannel,
} from "@/lib/plush/series";
import { CHANNEL_KEYS, getChannel, type ChannelKey, type CurrencyRates } from "@/lib/plush/channels";
import { CHARACTER_KEYS, CHARACTERS, type CharacterKey } from "@/lib/plush/characters";
import {
  AUTHENTICITY,
  AUTHENTICITY_LEVELS,
  CONDITION,
  CONDITIONS,
  RARITY,
  RARITY_TIERS,
  SIZE,
  TAG_CONDITION,
  TAG_CONDITIONS,
  type Authenticity,
  type Condition,
  type RarityTier,
  type SizeKey,
  type TagCondition,
} from "@/lib/plush/grading";
import { toValuationInput, valuate } from "@/lib/plush/valuation";
import { ValuationPanel } from "./ValuationPanel";

export interface ItemFormValues {
  name: string;
  nameOriginal: string;
  character: CharacterKey;
  series: string;
  catalogNumber: string;
  releaseYear: number | null;
  discontinued: boolean;
  isSpecialEdition: boolean;
  size: SizeKey;
  authenticity: Authenticity;
  condition: Condition;
  tagCondition: TagCondition;
  rarity: RarityTier;
  quantity: number;
  purchasePriceTwd: number | null;
  purchaseDate: string | null;
  notes: string;
  tags: string[];
  photo: string | null;
}

export function emptyFormValues(): ItemFormValues {
  return {
    name: "",
    nameOriginal: "",
    character: "chiikawa",
    series: defaultSeriesForChannel("official_store"),
    catalogNumber: "",
    releaseYear: null,
    discontinued: false,
    isSpecialEdition: false,
    size: "s",
    authenticity: "unverified",
    condition: "near_mint",
    tagCondition: "tag_mint",
    rarity: "C",
    quantity: 1,
    purchasePriceTwd: null,
    purchaseDate: null,
    notes: "",
    tags: [],
    photo: null,
  };
}

interface Props {
  values: ItemFormValues;
  onChange: (values: ItemFormValues) => void;
  /** 由伺服器算好的匯率，確保兩端估值一致 */
  rates: CurrencyRates;
  submitLabel: string;
  onSubmit: () => void;
  submitting: boolean;
  onDelete?: () => void;
}

export function ItemForm({ values, onChange, rates, submitLabel, onSubmit, submitting, onDelete }: Props) {
  const [tagInput, setTagInput] = useState(values.tags.join(", "));

  const set = <K extends keyof ItemFormValues>(key: K, value: ItemFormValues[K]) =>
    onChange({ ...values, [key]: value });

  const series = getSeries(values.series);
  const channel = getChannel(series.channel);
  const channelSeries = seriesForChannel(channel.key);

  /** 換通路時把產品線一起換掉，否則兩者會兜不起來。 */
  const changeChannel = (next: ChannelKey) => {
    const nextChannel = getChannel(next);
    onChange({
      ...values,
      series: defaultSeriesForChannel(next),
      // 新通路沒有這個尺寸時，退回不明而不是留一個矛盾的值
      size: nextChannel.sizeKeys.includes(values.size) ? values.size : "unknown",
      // 特別版的意思跟著通路走，換通路就不該沿用
      isSpecialEdition: false,
    });
  };

  // 表單一改動就重算估值，讓使用者看得到「吊牌剪掉」會掉多少
  const valuation = useMemo(() => valuate(toValuationInput(values), { rates }), [values, rates]);

  const commitTags = () => {
    const tags = tagInput
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean);
    set("tags", tags);
  };

  return (
    <>
      <ValuationPanel valuation={valuation} />

      <section className="panel">
        <h2>玩偶資料</h2>

        <div className="field">
          <label htmlFor="name">商品名稱 *</label>
          <input
            id="name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="例：吉伊卡哇 討伐造型玩偶 S"
          />
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="nameOriginal">日文原名</label>
            <input
              id="nameOriginal"
              value={values.nameOriginal}
              onChange={(e) => set("nameOriginal", e.target.value)}
              placeholder="Mercari／駿河屋搜尋用"
            />
          </div>
          <div className="field">
            <label htmlFor="character">角色</label>
            <select
              id="character"
              value={values.character}
              onChange={(e) => set("character", e.target.value as CharacterKey)}
            >
              {CHARACTER_KEYS.map((key) => (
                <option key={key} value={key}>
                  {CHARACTERS[key].nameZh}（{CHARACTERS[key].nameJa}）
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="catalogNumber">JAN／商品編號</label>
            <input
              id="catalogNumber"
              value={values.catalogNumber}
              onChange={(e) => set("catalogNumber", e.target.value)}
              placeholder="吊牌背面的條碼數字"
            />
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="channel">出處</label>
            <select id="channel" value={channel.key} onChange={(e) => changeChannel(e.target.value as ChannelKey)}>
              {CHANNEL_KEYS.map((key) => (
                <option key={key} value={key}>
                  {getChannel(key).nameZh}
                </option>
              ))}
            </select>
            <p className="field-hint">{channel.tagHintZh}</p>
          </div>
          <div className="field">
            <label htmlFor="series">產品線</label>
            <select id="series" value={values.series} onChange={(e) => set("series", e.target.value)}>
              {channelSeries.map((info) => (
                <option key={info.key} value={info.key}>
                  {info.nameZh}
                </option>
              ))}
            </select>
            <p className="field-hint">{series.noteZh}</p>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="size">尺寸</label>
            <select id="size" value={values.size} onChange={(e) => set("size", e.target.value as SizeKey)}>
              {channel.sizeKeys.map((key) => (
                <option key={key} value={key}>
                  {SIZE[key].labelZh}
                </option>
              ))}
            </select>
            <p className="field-hint">{SIZE[values.size].descZh}</p>
          </div>
          <div className="field">
            <label htmlFor="rarity">稀有度</label>
            <select id="rarity" value={values.rarity} onChange={(e) => set("rarity", e.target.value as RarityTier)}>
              {RARITY_TIERS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier}・{RARITY[tier].labelZh}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="authenticity">正版查證</label>
            <select
              id="authenticity"
              value={values.authenticity}
              onChange={(e) => set("authenticity", e.target.value as Authenticity)}
            >
              {AUTHENTICITY_LEVELS.map((key) => (
                <option key={key} value={key}>
                  {AUTHENTICITY[key].labelZh}
                </option>
              ))}
            </select>
            <p className="field-hint">
              {channel.authenticitySensitivity >= 0.8
                ? "這個出處是仿冒重災區，查證過再入手。"
                : "這個出處的仿冒風險相對低，但仍建議比對吊牌。"}
            </p>
          </div>
        </div>

        <div className="field-row">
          <div className="field">
            <label htmlFor="condition">本體狀態</label>
            <select id="condition" value={values.condition} onChange={(e) => set("condition", e.target.value as Condition)}>
              {CONDITIONS.map((key) => (
                <option key={key} value={key}>
                  {CONDITION[key].labelZh}（{CONDITION[key].abbr}）
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="tagCondition">吊牌狀態</label>
            <select
              id="tagCondition"
              value={values.tagCondition}
              onChange={(e) => set("tagCondition", e.target.value as TagCondition)}
            >
              {TAG_CONDITIONS.map((key) => (
                <option key={key} value={key}>
                  {TAG_CONDITION[key].labelZh}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="releaseYear">發售年份</label>
            <input
              id="releaseYear"
              type="number"
              inputMode="numeric"
              value={values.releaseYear ?? ""}
              onChange={(e) => set("releaseYear", e.target.value ? Number(e.target.value) : null)}
              placeholder="2023"
            />
          </div>
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={values.discontinued}
            onChange={(e) => set("discontinued", e.target.checked)}
          />
          已停售（會計入年資加成）
        </label>

        {channel.specialVariant && (
          <label className="checkbox">
            <input
              type="checkbox"
              checked={values.isSpecialEdition}
              onChange={(e) => set("isSpecialEdition", e.target.checked)}
            />
            {channel.specialVariant.labelZh}
            <span className="field-hint" style={{ margin: 0 }}>
              ×{channel.specialVariant.multiplier}
            </span>
          </label>
        )}
      </section>

      <section className="panel">
        <h2>我的記錄</h2>
        <div className="field-row">
          <div className="field">
            <label htmlFor="quantity">數量</label>
            <input
              id="quantity"
              type="number"
              min={1}
              value={values.quantity}
              onChange={(e) => set("quantity", Math.max(1, Number(e.target.value) || 1))}
            />
          </div>
          <div className="field">
            <label htmlFor="purchasePrice">購入價（NT$）</label>
            <input
              id="purchasePrice"
              type="number"
              inputMode="numeric"
              value={values.purchasePriceTwd ?? ""}
              onChange={(e) => set("purchasePriceTwd", e.target.value ? Number(e.target.value) : null)}
              placeholder="用來計算損益"
            />
          </div>
          <div className="field">
            <label htmlFor="purchaseDate">購入日期</label>
            <input
              id="purchaseDate"
              type="date"
              value={values.purchaseDate ?? ""}
              onChange={(e) => set("purchaseDate", e.target.value || null)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="tags">標籤（用逗號分隔）</label>
          <input
            id="tags"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onBlur={commitTags}
            placeholder="日本帶回, 夾到的, 待售"
          />
        </div>

        <div className="field">
          <label htmlFor="notes">備註</label>
          <textarea
            id="notes"
            rows={3}
            value={values.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="購買地點、賣家、查證過程…"
          />
        </div>
      </section>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            commitTags();
            onSubmit();
          }}
          disabled={submitting || !values.name.trim()}
        >
          {submitting && <span className="spinner" />}
          {submitLabel}
        </button>
        {onDelete && (
          <button type="button" className="btn btn-danger" onClick={onDelete} disabled={submitting}>
            刪除
          </button>
        )}
      </div>
    </>
  );
}
