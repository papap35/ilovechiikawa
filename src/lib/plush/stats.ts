import type { CollectionItem } from "./schema";
import { toValuationInput, valuate, type ValuationOptions } from "./valuation";
import { getSeries } from "./series";
import { getChannel, type ChannelKey } from "./channels";
import { getCharacter, type CharacterKey } from "./characters";
import { RARITY, type RarityTier } from "./grading";

export interface Bucket {
  key: string;
  labelZh: string;
  count: number;
  valueTwd: number;
}

export interface CollectionStats {
  totalItems: number;
  totalUnits: number;
  /** 估值中位數合計（新台幣） */
  estimatedValueTwd: number;
  estimatedLowTwd: number;
  estimatedHighTwd: number;
  /** 已填購入價的部分的成本合計 */
  investedTwd: number;
  /** 有成本資料的那些玩偶，估值 − 成本 */
  unrealizedGainTwd: number;
  /** 有填購入價的品項數（未乘數量） */
  itemsWithCost: number;
  /** 尚未確認正版的隻數（未查證＋疑似仿冒），提醒使用者該去查證 */
  unverifiedUnits: number;
  byCharacter: Bucket[];
  byChannel: Bucket[];
  bySeries: Bucket[];
  byRarity: Bucket[];
  /** 估值最高的前幾隻 */
  topValued: { id: string; name: string; valueTwd: number; rarity: RarityTier }[];
}

export function itemValueTwd(item: CollectionItem, options?: ValuationOptions): number {
  return valuate(toValuationInput(item), options).midTwd;
}

const RARITY_ORDER: RarityTier[] = ["S", "A", "B", "C", "D"];

export function computeStats(items: CollectionItem[], options?: ValuationOptions): CollectionStats {
  const characterBuckets = new Map<CharacterKey, Bucket>();
  const channelBuckets = new Map<ChannelKey, Bucket>();
  const seriesBuckets = new Map<string, Bucket>();
  const rarityBuckets = new Map<RarityTier, Bucket>();

  let totalUnits = 0;
  let estimatedValueTwd = 0;
  let estimatedLowTwd = 0;
  let estimatedHighTwd = 0;
  let investedTwd = 0;
  let valueOfCostedItems = 0;
  let itemsWithCost = 0;
  let unverifiedUnits = 0;

  const valued: { id: string; name: string; valueTwd: number; rarity: RarityTier }[] = [];

  const bump = <K>(map: Map<K, Bucket>, key: K, labelZh: string, qty: number, value: number) => {
    const bucket = map.get(key) ?? { key: String(key), labelZh, count: 0, valueTwd: 0 };
    bucket.count += qty;
    bucket.valueTwd += value;
    map.set(key, bucket);
  };

  for (const item of items) {
    const valuation = valuate(toValuationInput(item), options);
    const qty = item.quantity;
    const lineValue = valuation.midTwd * qty;

    totalUnits += qty;
    estimatedValueTwd += lineValue;
    estimatedLowTwd += valuation.lowTwd * qty;
    estimatedHighTwd += valuation.highTwd * qty;

    if (item.purchasePriceTwd !== null) {
      investedTwd += item.purchasePriceTwd * qty;
      valueOfCostedItems += lineValue;
      itemsWithCost += 1;
    }

    if (item.authenticity === "unverified" || item.authenticity === "suspicious") {
      unverifiedUnits += qty;
    }

    const series = getSeries(item.series);
    const channel = getChannel(series.channel);
    const character = getCharacter(item.character);
    const rarity = RARITY[item.rarity] ?? RARITY.C;

    bump(characterBuckets, character.key, character.nameZh, qty, lineValue);
    bump(channelBuckets, channel.key, channel.nameZh, qty, lineValue);
    bump(seriesBuckets, series.key, `${channel.nameZh}・${series.nameZh}`, qty, lineValue);
    bump(rarityBuckets, item.rarity, `${rarity.tier}・${rarity.labelZh}`, qty, lineValue);

    valued.push({
      id: item.id,
      name: item.name,
      valueTwd: valuation.midTwd,
      rarity: item.rarity,
    });
  }

  const byValue = (a: Bucket, b: Bucket) => b.valueTwd - a.valueTwd;

  return {
    totalItems: items.length,
    totalUnits,
    estimatedValueTwd,
    estimatedLowTwd,
    estimatedHighTwd,
    investedTwd,
    unrealizedGainTwd: valueOfCostedItems - investedTwd,
    itemsWithCost,
    unverifiedUnits,
    byCharacter: [...characterBuckets.values()].sort(byValue),
    byChannel: [...channelBuckets.values()].sort(byValue),
    bySeries: [...seriesBuckets.values()].sort(byValue),
    byRarity: [...rarityBuckets.values()].sort(
      (a, b) => RARITY_ORDER.indexOf(a.key as RarityTier) - RARITY_ORDER.indexOf(b.key as RarityTier),
    ),
    topValued: valued.sort((a, b) => b.valueTwd - a.valueTwd).slice(0, 5),
  };
}
