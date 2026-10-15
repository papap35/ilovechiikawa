"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getSeries } from "@/lib/plush/series";
import { getChannel, type ChannelKey } from "@/lib/plush/channels";
import { getCharacter, type CharacterKey } from "@/lib/plush/characters";
import { RARITY_TIERS, SIZE, type Authenticity, type RarityTier, type SizeKey } from "@/lib/plush/grading";
import { twd } from "@/lib/format";

export interface CollectionCard {
  id: string;
  name: string;
  character: CharacterKey;
  catalogNumber: string;
  series: string;
  size: SizeKey;
  rarity: RarityTier;
  authenticity: Authenticity;
  isSpecialEdition: boolean;
  quantity: number;
  photo: string | null;
  tags: string[];
  valueTwd: number;
}

type SortKey = "recent" | "value_desc" | "name_asc";

/** 依數量排出收藏庫中實際出現過的值，選單才不會又長又空。 */
function present<K>(items: CollectionCard[], keyOf: (item: CollectionCard) => K): [K, number][] {
  const seen = new Map<K, number>();
  for (const item of items) {
    const key = keyOf(item);
    seen.set(key, (seen.get(key) ?? 0) + item.quantity);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]);
}

export function CollectionBrowser({ items }: { items: CollectionCard[] }) {
  const [query, setQuery] = useState("");
  const [character, setCharacter] = useState<CharacterKey | "all">("all");
  const [channel, setChannel] = useState<ChannelKey | "all">("all");
  const [rarity, setRarity] = useState<RarityTier | "all">("all");
  const [sort, setSort] = useState<SortKey>("recent");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (character !== "all" && item.character !== character) return false;
      if (channel !== "all" && getSeries(item.series).channel !== channel) return false;
      if (rarity !== "all" && item.rarity !== rarity) return false;
      if (!needle) return true;
      const series = getSeries(item.series);
      const char = getCharacter(item.character);
      const haystack = [
        item.name,
        item.catalogNumber,
        char.nameZh,
        char.nameJa,
        series.nameZh,
        getChannel(series.channel).nameZh,
        getChannel(series.channel).nameJa,
        ...item.tags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });

    // items 進來時已依建立時間新到舊排序，所以 recent 不需要再動
    if (sort === "value_desc") return [...filtered].sort((a, b) => b.valueTwd - a.valueTwd);
    if (sort === "name_asc") return [...filtered].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
    return filtered;
  }, [items, query, character, channel, rarity, sort]);

  const presentCharacters = useMemo(() => present(items, (item) => item.character), [items]);
  const presentChannels = useMemo(() => present(items, (item) => getSeries(item.series).channel), [items]);

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="搜尋商品、角色、出處、編號或標籤…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="搜尋收藏"
        />
        <select
          value={character}
          onChange={(e) => setCharacter(e.target.value as CharacterKey | "all")}
          aria-label="篩選角色"
        >
          <option value="all">全部角色</option>
          {presentCharacters.map(([key, count]) => (
            <option key={key} value={key}>
              {getCharacter(key).nameZh}（{count}）
            </option>
          ))}
        </select>
        <select value={channel} onChange={(e) => setChannel(e.target.value as ChannelKey | "all")} aria-label="篩選出處">
          <option value="all">全部出處</option>
          {presentChannels.map(([key, count]) => (
            <option key={key} value={key}>
              {getChannel(key).nameZh}（{count}）
            </option>
          ))}
        </select>
        <select value={rarity} onChange={(e) => setRarity(e.target.value as RarityTier | "all")} aria-label="篩選稀有度">
          <option value="all">全部稀有度</option>
          {RARITY_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {tier} 級
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="排序方式">
          <option value="recent">最近加入</option>
          <option value="value_desc">估值由高到低</option>
          <option value="name_asc">名稱排序</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className="empty">沒有符合條件的收藏。</div>
      ) : (
        <div className="card-grid">
          {visible.map((item) => {
            const series = getSeries(item.series);
            const itemChannel = getChannel(series.channel);
            return (
              <Link key={item.id} href={`/item/${item.id}`} className="card">
                <div className="thumb">
                  {item.photo ? (
                    // 使用者拍的照片以 data URL 存放，不走 next/image 的最佳化管線
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.photo} alt={item.name} />
                  ) : (
                    <span>無照片</span>
                  )}
                </div>
                <div className="body">
                  <div className="brand-line">
                    {getCharacter(item.character).nameZh}・{itemChannel.nameZh}
                  </div>
                  <div className="title">{item.name}</div>
                  <div className="meta">
                    {[series.nameZh, SIZE[item.size].labelZh, item.quantity > 1 ? `×${item.quantity}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <span className={`badge badge-${item.rarity}`}>{item.rarity}</span>
                    {item.isSpecialEdition && itemChannel.specialVariant && (
                      <span className="badge badge-special">{itemChannel.specialVariant.shortZh}</span>
                    )}
                    {(item.authenticity === "suspicious" || item.authenticity === "counterfeit") && (
                      <span className="badge badge-warn">
                        {item.authenticity === "counterfeit" ? "仿冒" : "疑似仿冒"}
                      </span>
                    )}
                  </div>
                  <div className="price">{twd(item.valueTwd)}</div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
