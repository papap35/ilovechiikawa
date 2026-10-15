"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CollectionItem } from "@/lib/plush/schema";
import { buildComparison, MAX_COMPARE_ITEMS } from "@/lib/plush/compare";
import { getSeries } from "@/lib/plush/series";
import { getChannel, type CurrencyRates } from "@/lib/plush/channels";
import { getCharacter } from "@/lib/plush/characters";
import { multiplier, signedTwd, twd } from "@/lib/format";

export function CompareClient({
  items,
  initialIds,
  rates,
}: {
  items: CollectionItem[];
  initialIds: string[];
  rates: CurrencyRates;
}) {
  const [selected, setSelected] = useState<string[]>(() =>
    initialIds.filter((id) => items.some((item) => item.id === id)).slice(0, MAX_COMPARE_ITEMS),
  );
  const [query, setQuery] = useState("");
  const [onlyDifferences, setOnlyDifferences] = useState(true);

  const chosen = useMemo(
    () =>
      selected
        .map((id) => items.find((item) => item.id === id))
        .filter((item): item is CollectionItem => Boolean(item)),
    [selected, items],
  );

  const comparison = useMemo(() => buildComparison(chosen, { rates }), [chosen, rates]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((existing) => existing !== id);
      if (prev.length >= MAX_COMPARE_ITEMS) return prev;
      return [...prev, id];
    });
  };

  const pickable = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const series = getSeries(item.series);
      return [
        item.name,
        item.catalogNumber,
        getCharacter(item.character).nameZh,
        getChannel(series.channel).nameZh,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [items, query]);

  const maxValue = Math.max(1, ...comparison.entries.map((entry) => entry.valuation.midTwd));

  /**
   * 表頭同時標出出處與商品名。
   * 這頁最常見的用法就是拿同一個角色比不同出處，只印名稱會讓三欄看起來差不多。
   */
  const columnHeaders = comparison.entries.map((entry) => (
    <th scope="col" key={entry.item.id}>
      <span className="pick-brand">{getChannel(getSeries(entry.item.series).channel).nameZh}</span>
      <span className="col-name">{entry.item.name}</span>
    </th>
  ));

  if (items.length === 0) {
    return (
      <main>
        <div className="empty">
          <p style={{ marginTop: 0 }}>收藏庫還是空的，先加幾隻玩偶才有得比。</p>
          <Link href="/scan" className="btn btn-primary">
            開始第一次鑑定
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <section className="panel">
        <h2>選擇要比較的玩偶（最多 {MAX_COMPARE_ITEMS} 隻）</h2>
        <input
          type="search"
          className="compare-search"
          placeholder="搜尋商品、角色、出處或編號…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜尋要比較的玩偶"
        />
        <div className="pick-list">
          {pickable.map((item) => {
            const series = getSeries(item.series);
            const channel = getChannel(series.channel);
            const isChosen = selected.includes(item.id);
            const disabled = !isChosen && selected.length >= MAX_COMPARE_ITEMS;
            return (
              <label key={item.id} className={`pick${isChosen ? " picked" : ""}${disabled ? " disabled" : ""}`}>
                <input
                  type="checkbox"
                  checked={isChosen}
                  disabled={disabled}
                  onChange={() => toggle(item.id)}
                />
                <span className="pick-body">
                  <span className="pick-brand">
                    {getCharacter(item.character).nameZh}・{channel.nameZh}
                  </span>
                  <span className="pick-name">{item.name}</span>
                  <span className="pick-meta">
                    {[series.nameZh, item.catalogNumber].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </label>
            );
          })}
          {pickable.length === 0 && <div className="empty">沒有符合的玩偶。</div>}
        </div>
      </section>

      {chosen.length < 2 ? (
        <div className="notice notice-info">
          選兩隻以上才開始比較。跨出處也可以比——例如同樣是小八，官方常規款、夾娃娃機景品和一番賞大獎
          的行情差距，通常就是這個工具最有意思的地方。
        </div>
      ) : (
        <>
          <section className="panel">
            <h2>估值對照</h2>
            <p className="panel-note">
              最高與最低差 {comparison.valueSpread.toFixed(1)} 倍。
            </p>
            <div className="compare-chart">
              {comparison.entries.map((entry, index) => {
                const series = getSeries(entry.item.series);
                const channel = getChannel(series.channel);
                const isTop = index === comparison.topIndex;
                return (
                  <div className="compare-bar-row" key={entry.item.id}>
                    <div className="compare-bar-label">
                      <span className="pick-brand">{channel.nameZh}</span>
                      <Link href={`/item/${entry.item.id}`}>{entry.item.name}</Link>
                    </div>
                    <div className="compare-bar-track">
                      <div className="compare-bar-slot">
                        <div
                          className={`compare-bar-fill${isTop ? " top" : ""}`}
                          style={{ width: `${(entry.valuation.midTwd / maxValue) * 100}%` }}
                          title={`${entry.item.name}：${twd(entry.valuation.midTwd)}（區間 ${twd(
                            entry.valuation.lowTwd,
                          )} – ${twd(entry.valuation.highTwd)}）`}
                        />
                      </div>
                      <span className="compare-bar-value">{twd(entry.valuation.midTwd)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <h2>成本與損益</h2>
            <div className="compare-scroll">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th scope="col">項目</th>
                    {columnHeaders}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">估值中位數</th>
                    {comparison.entries.map((entry) => (
                      <td key={entry.item.id} className="num">
                        {twd(entry.valuation.midTwd)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">估值區間</th>
                    {comparison.entries.map((entry) => (
                      <td key={entry.item.id} className="num dim">
                        {twd(entry.valuation.lowTwd)} – {twd(entry.valuation.highTwd)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">主要市場</th>
                    {comparison.entries.map((entry) => (
                      <td key={entry.item.id} className="num dim">
                        {entry.valuation.market.symbol}
                        {entry.valuation.market.mid.toLocaleString("en-US")} {entry.valuation.market.currency}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">購入價</th>
                    {comparison.entries.map((entry) => (
                      <td key={entry.item.id} className="num">
                        {entry.item.purchasePriceTwd === null ? "—" : twd(entry.item.purchasePriceTwd)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row">未實現損益</th>
                    {comparison.entries.map((entry) => (
                      <td
                        key={entry.item.id}
                        className={`num ${entry.gainTwd === null ? "dim" : entry.gainTwd >= 0 ? "pos" : "neg"}`}
                      >
                        {entry.gainTwd === null ? "—" : signedTwd(entry.gainTwd)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h2>價差來自哪裡</h2>
            <p className="panel-note">
              依造成的價差大小排序。倍率相同的係數不影響比較結果。
            </p>
            <div className="compare-scroll">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th scope="col">估值係數</th>
                    {columnHeaders}
                    <th scope="col" className="num">
                      價差
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="base-row">
                    <th scope="row">產品線基準行情</th>
                    {comparison.entries.map((entry) => (
                      <td key={entry.item.id} className="num">
                        {twd(entry.valuation.baseTwd)}
                      </td>
                    ))}
                    <td className="num dim">—</td>
                  </tr>
                  {comparison.factorRows.map((factorRow) => (
                    <tr key={factorRow.labelZh} className={factorRow.identical ? "same-row" : ""}>
                      <th scope="row">{factorRow.labelZh}</th>
                      {factorRow.multipliers.map((value, index) => (
                        <td key={comparison.entries[index].item.id} className="num">
                          {value === null ? "—" : multiplier(value)}
                        </td>
                      ))}
                      <td className="num">
                        {factorRow.identical ? (
                          <span className="dim">相同</span>
                        ) : (
                          <span className="spread">{factorRow.spread.toFixed(2)}×</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>屬性對照</h2>
              <label className="checkbox" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={onlyDifferences}
                  onChange={(e) => setOnlyDifferences(e.target.checked)}
                />
                只看有差異的欄位
              </label>
            </div>
            <div className="compare-scroll">
              <table className="compare-table">
                <thead>
                  <tr>
                    <th scope="col">欄位</th>
                    {columnHeaders}
                  </tr>
                </thead>
                <tbody>
                  {comparison.attributeRows
                    .filter((attributeRow) => !onlyDifferences || !attributeRow.identical)
                    .map((attributeRow) => (
                      <tr key={attributeRow.labelZh} className={attributeRow.identical ? "same-row" : ""}>
                        <th scope="row">{attributeRow.labelZh}</th>
                        {attributeRow.values.map((value, index) => (
                          <td key={comparison.entries[index].item.id}>{value}</td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {onlyDifferences &&
              comparison.attributeRows.every((attributeRow) => attributeRow.identical) && (
                <div className="empty" style={{ marginTop: 12 }}>
                  這幾隻在所有屬性上都相同。
                </div>
              )}
          </section>
        </>
      )}
    </main>
  );
}
