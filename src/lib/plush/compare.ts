/**
 * 收藏品比較。
 *
 * 比較的重點不是把數字並排，而是回答「為什麼這隻比那隻值錢」。
 * 所以除了屬性對照，還要把估值係數逐項攤開，並標出真正造成差距的那幾項——
 * 相同的欄位可以摺疊掉，差異才是要看的東西。
 */

import type { CollectionItem } from "./schema";
import {
  toValuationInput,
  valuate,
  type FactorDimension,
  type Valuation,
  type ValuationOptions,
} from "./valuation";
import { getSeries } from "./series";
import { getChannel } from "./channels";
import { getCharacter } from "./characters";
import { AUTHENTICITY, CONDITION, RARITY, SIZE, TAG_CONDITION } from "./grading";

export const MAX_COMPARE_ITEMS = 4;

export interface CompareEntry {
  item: CollectionItem;
  valuation: Valuation;
  /** 估值 − 購入價。沒填購入價時為 null。 */
  gainTwd: number | null;
}

export interface CompareRow {
  labelZh: string;
  /** 每個被比較項目在這一列的顯示值 */
  values: string[];
  /** 這一列各項目是否相同。全部相同的列可以摺疊起來。 */
  identical: boolean;
}

export interface FactorRow {
  dimension: FactorDimension;
  labelZh: string;
  /** 各項目在這一項係數上的倍率。該項目沒有這個係數時為 null。 */
  multipliers: (number | null)[];
  identical: boolean;
  /**
   * 這一項造成的最大價差倍數（最高倍率 ÷ 最低倍率）。
   * 用來排序，把真正拉開差距的係數放到最前面。
   */
  spread: number;
}

export interface Comparison {
  entries: CompareEntry[];
  attributeRows: CompareRow[];
  factorRows: FactorRow[];
  /** 估值最高的項目在 entries 中的索引 */
  topIndex: number;
  /** 最高與最低估值的差距倍數 */
  valueSpread: number;
}

function allSame(values: unknown[]): boolean {
  return values.every((value) => value === values[0]);
}

function row(labelZh: string, values: string[]): CompareRow {
  return { labelZh, values, identical: allSame(values) };
}

export function buildComparison(
  items: CollectionItem[],
  options?: ValuationOptions,
): Comparison {
  const entries: CompareEntry[] = items.map((item) => {
    const valuation = valuate(toValuationInput(item), options);
    return {
      item,
      valuation,
      gainTwd: item.purchasePriceTwd === null ? null : valuation.midTwd - item.purchasePriceTwd,
    };
  });

  const attributeRows: CompareRow[] = entries.length
    ? [
        row("角色", entries.map((e) => getCharacter(e.item.character).nameZh)),
        row("出處", entries.map((e) => getChannel(getSeries(e.item.series).channel).nameZh)),
        row("產品線", entries.map((e) => getSeries(e.item.series).nameZh)),
        row("JAN／編號", entries.map((e) => e.item.catalogNumber || "—")),
        row("尺寸", entries.map((e) => SIZE[e.item.size].labelZh)),
        row("稀有度", entries.map((e) => `${e.item.rarity}・${RARITY[e.item.rarity].labelZh}`)),
        row("正版查證", entries.map((e) => AUTHENTICITY[e.item.authenticity].labelZh)),
        row("本體狀態", entries.map((e) => CONDITION[e.item.condition].labelZh)),
        row("吊牌狀態", entries.map((e) => TAG_CONDITION[e.item.tagCondition].labelZh)),
        row(
          "特別版",
          entries.map((e) => {
            if (!e.item.isSpecialEdition) return "否";
            const variant = getChannel(getSeries(e.item.series).channel).specialVariant;
            return variant ? variant.labelZh : "是";
          }),
        ),
        row("發售年份", entries.map((e) => (e.item.releaseYear ? `${e.item.releaseYear}` : "—"))),
        row("停售", entries.map((e) => (e.item.discontinued ? "是" : "否"))),
        row("數量", entries.map((e) => `${e.item.quantity}`)),
      ]
    : [];

  // 各項目的係數不完全一樣（有的有特別版、有的有停售年資），
  // 所以先收集所有出現過的維度，再逐項對照。維度是係數自己帶的代號，
  // 不是從標題切出來的——「ラストワン賞」這種名字切不出東西。
  const dimensions: { key: FactorDimension; labelZh: string }[] = [];
  for (const entry of entries) {
    for (const factor of entry.valuation.factors) {
      if (dimensions.some((d) => d.key === factor.dimension)) continue;
      dimensions.push({ key: factor.dimension, labelZh: factor.dimensionLabelZh });
    }
  }

  const factorRows: FactorRow[] = dimensions.map(({ key, labelZh }) => {
    const multipliers = entries.map((entry) => {
      const factor = entry.valuation.factors.find((f) => f.dimension === key);
      return factor ? factor.multiplier : null;
    });
    // 缺席的係數視為 1.0（沒有這項加成），這樣「有最後賞 vs 沒有」也算得出價差
    const effective = multipliers.map((m) => m ?? 1);
    const spread = Math.max(...effective) / Math.min(...effective);
    return {
      dimension: key,
      labelZh,
      multipliers,
      identical: allSame(effective),
      spread,
    };
  });

  // 把拉開最大價差的係數排到最前面——那才是這場比較的答案
  factorRows.sort((a, b) => b.spread - a.spread);

  const values = entries.map((e) => e.valuation.midTwd);
  const topIndex = values.length ? values.indexOf(Math.max(...values)) : -1;
  const minValue = values.length ? Math.min(...values) : 0;
  const valueSpread = values.length && minValue > 0 ? Math.max(...values) / minValue : 1;

  return { entries, attributeRows, factorRows, topIndex, valueSpread };
}
