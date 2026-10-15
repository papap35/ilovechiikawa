/**
 * 估值引擎。
 *
 * 刻意做成「可解釋」的乘數模型而不是黑箱：每一項係數都會回傳理由，
 * UI 上直接列給收藏者看，讓人能判斷這個估值該不該信。
 *
 * 內部一律以新台幣計算，再依通路換算回它的主要參考市場幣別
 * （日本出處看 Mercari／駿河屋 JPY，台灣授權商品看 TWD），
 * 這樣主要顯示的數字不需要經過任何匯率換算。
 */

import { getSeries } from "./series";
import {
  AUTHENTICITY,
  CONDITION,
  RARITY,
  SIZE,
  TAG_CONDITION,
  type Authenticity,
  type Condition,
  type RarityTier,
  type SizeKey,
  type TagCondition,
} from "./grading";
import {
  CURRENCY_SYMBOL,
  currencyRates,
  getChannel,
  type CurrencyRates,
  type MarketCurrency,
} from "./channels";
import { getCharacter, themeDemandFor, type CharacterKey } from "./characters";

export interface ValuationInput {
  series: string;
  character: CharacterKey;
  rarity: RarityTier;
  size: SizeKey;
  authenticity: Authenticity;
  condition: Condition;
  tagCondition: TagCondition;
  /** 是否為該通路的特別版（一番賞ラストワン賞／官方抽選販售…） */
  isSpecialEdition: boolean;
  /** 商品名稱，用來查造型主題係數 */
  name?: string | null;
  nameOriginal?: string | null;
  /** 發售年份（西元）。用來計算停售年資加成。 */
  releaseYear?: number | null;
  /** 是否已停售。未停售就不吃年資加成。 */
  discontinued?: boolean;
}

/** 係數的維度代號。比較時用它對齊兩隻玩偶的同一項係數。 */
export type FactorDimension =
  | "rarity"
  | "size"
  | "authenticity"
  | "condition"
  | "tagCondition"
  | "character"
  | "theme"
  | "specialEdition"
  | "vintage";

export interface ValuationFactor {
  dimension: FactorDimension;
  /** 這個維度的通用名稱，比較表的列標題用它 */
  dimensionLabelZh: string;
  /** 帶著本次分級的完整標題，估值明細用它 */
  labelZh: string;
  detailZh: string;
  multiplier: number;
}

export interface MarketValue {
  currency: MarketCurrency;
  symbol: string;
  mid: number;
  low: number;
  high: number;
  /** 該幣別兌新台幣的匯率 */
  rate: number;
}

export interface Valuation {
  /** 估值中位數（新台幣），這是 UI 的主要數字 */
  midTwd: number;
  lowTwd: number;
  highTwd: number;
  baseTwd: number;
  /** 換算回通路主要參考市場的金額 */
  market: MarketValue;
  factors: ValuationFactor[];
}

export interface ValuationOptions {
  /** 計算停售年資用的基準時間，測試時可注入。 */
  now?: Date;
  /** 各市場幣別的匯率。省略時讀環境設定（客戶端請明確傳入）。 */
  rates?: CurrencyRates;
}

/**
 * 停售年資加成：每滿 1 年 +5%，上限 +30%。
 *
 * 玩偶商品的週期比合金車短得多，停售一兩年就已經明顯難買，
 * 所以步距用年而不是五年。
 */
export function vintageMultiplier(
  releaseYear: number | null | undefined,
  discontinued: boolean | undefined,
  now = new Date(),
): { multiplier: number; years: number } {
  if (!discontinued || !releaseYear || !Number.isFinite(releaseYear)) {
    return { multiplier: 1, years: 0 };
  }
  const years = Math.max(0, now.getFullYear() - releaseYear);
  const multiplier = Math.min(1.3, 1 + years * 0.05);
  return { multiplier, years };
}

/**
 * 正版查證係數，依通路的仿冒風險縮放。
 *
 * 表上的數字是「仿冒最多的通路」的滿額扣分。官方店直購的未查證風險低很多，
 * 就用 authenticitySensitivity 把偏離 1.0 的幅度壓下來。
 * 標記為不縮放的等級（已查證、確認仿冒）直接套用。
 */
export function scaledAuthenticityMultiplier(level: Authenticity, sensitivity: number): number {
  const info = AUTHENTICITY[level] ?? AUTHENTICITY.unverified;
  if (!info.scaled) return info.multiplier;
  return 1 + (info.multiplier - 1) * sensitivity;
}

export function valuate(input: ValuationInput, options: ValuationOptions = {}): Valuation {
  const now = options.now ?? new Date();
  const rates = options.rates ?? currencyRates();

  const series = getSeries(input.series);
  const channel = getChannel(series.channel);
  const character = getCharacter(input.character);
  const rarity = RARITY[input.rarity] ?? RARITY.C;
  const size = SIZE[input.size] ?? SIZE.unknown;
  const authenticityLevel: Authenticity = AUTHENTICITY[input.authenticity] ? input.authenticity : "unverified";
  const authenticity = AUTHENTICITY[authenticityLevel];
  const condition = CONDITION[input.condition] ?? CONDITION.used;
  const tagCondition = TAG_CONDITION[input.tagCondition] ?? TAG_CONDITION.tag_mint;
  const theme = themeDemandFor(input.name, input.nameOriginal);
  const vintage = vintageMultiplier(input.releaseYear, input.discontinued, now);

  const authenticityMultiplier = scaledAuthenticityMultiplier(authenticityLevel, channel.authenticitySensitivity);

  const authenticityDetail = !authenticity.scaled
    ? authenticity.descZh
    : channel.authenticitySensitivity >= 0.8
      ? `${channel.nameZh}是仿冒重災區，沒查證過的二手買家會大幅壓價。`
      : `${channel.nameZh}的仿冒風險相對低，未查證的扣分較輕。`;

  const factors: ValuationFactor[] = [
    {
      dimension: "rarity",
      dimensionLabelZh: "稀有度",
      labelZh: `稀有度 ${rarity.tier}・${rarity.labelZh}`,
      detailZh: rarity.descZh,
      multiplier: rarity.multiplier,
    },
    {
      dimension: "size",
      dimensionLabelZh: "尺寸",
      labelZh: `尺寸 ${size.labelZh}`,
      detailZh: size.descZh,
      multiplier: size.multiplier,
    },
    {
      dimension: "authenticity",
      dimensionLabelZh: "正版查證",
      labelZh: `正版查證 ${authenticity.labelZh}`,
      detailZh: authenticityDetail,
      multiplier: authenticityMultiplier,
    },
    {
      dimension: "condition",
      dimensionLabelZh: "本體狀態",
      labelZh: `本體狀態 ${condition.labelZh}`,
      detailZh: condition.descZh,
      multiplier: condition.multiplier,
    },
    {
      dimension: "tagCondition",
      dimensionLabelZh: "吊牌狀態",
      labelZh: `吊牌狀態 ${tagCondition.labelZh}`,
      detailZh: tagCondition.descZh,
      multiplier: tagCondition.multiplier,
    },
    {
      dimension: "character",
      dimensionLabelZh: "角色人氣",
      labelZh: `角色人氣 ${character.nameZh}`,
      detailZh: character.reasonZh,
      multiplier: character.multiplier,
    },
    {
      dimension: "theme",
      dimensionLabelZh: "造型主題",
      labelZh: "造型主題",
      detailZh: theme.reasonZh,
      multiplier: theme.multiplier,
    },
  ];

  if (input.isSpecialEdition && channel.specialVariant) {
    factors.push({
      dimension: "specialEdition",
      dimensionLabelZh: channel.specialVariant.labelZh,
      labelZh: channel.specialVariant.labelZh,
      detailZh: channel.specialVariant.descZh,
      multiplier: channel.specialVariant.multiplier,
    });
  }

  if (vintage.multiplier > 1) {
    factors.push({
      dimension: "vintage",
      dimensionLabelZh: "停售年資",
      labelZh: `停售年資 ${vintage.years} 年`,
      detailZh: "每滿 1 年 +5%，上限 +30%。",
      multiplier: vintage.multiplier,
    });
  }

  // 先把中位數定案（四捨五入），再往下推導區間與外幣。
  // 若各自從未取整的原始值計算，畫面上會出現彼此對不起來的數字。
  const midTwd = Math.round(factors.reduce((acc, f) => acc * f.multiplier, series.baseValueTwd));
  const lowTwd = Math.round(midTwd * 0.75);
  const highTwd = Math.round(midTwd * 1.35);

  const currency = channel.marketCurrency;
  const rate = rates[currency];

  return {
    baseTwd: series.baseValueTwd,
    midTwd,
    lowTwd,
    highTwd,
    market: {
      currency,
      symbol: CURRENCY_SYMBOL[currency],
      rate,
      mid: Math.round(midTwd / rate),
      low: Math.round(lowTwd / rate),
      high: Math.round(highTwd / rate),
    },
    factors,
  };
}

/** 收藏品、表單值、辨識結果都帶著這些欄位，統一在這裡轉成估值輸入。 */
export interface ValuationSource {
  series: string;
  character: CharacterKey;
  rarity: RarityTier;
  size: SizeKey;
  authenticity: Authenticity;
  condition: Condition;
  tagCondition: TagCondition;
  isSpecialEdition: boolean;
  name: string;
  nameOriginal: string;
  releaseYear: number | null;
  discontinued: boolean;
}

export function toValuationInput(source: ValuationSource): ValuationInput {
  return {
    series: source.series,
    character: source.character,
    rarity: source.rarity,
    size: source.size,
    authenticity: source.authenticity,
    condition: source.condition,
    tagCondition: source.tagCondition,
    isSpecialEdition: source.isSpecialEdition,
    name: source.name,
    nameOriginal: source.nameOriginal,
    // 辨識結果用 0 表示「判斷不出年份」
    releaseYear: source.releaseYear || null,
    discontinued: source.discontinued,
  };
}
