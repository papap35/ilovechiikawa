/**
 * 稀有度、尺寸、正版查證、本體狀態、吊牌狀態 —— 跨通路通用的分級語彙與係數。
 * 集中在這裡方便依實際成交行情微調；通路之間的差異由 channels.ts 的參數調節。
 */

export type RarityTier = "S" | "A" | "B" | "C" | "D";

export interface RarityInfo {
  tier: RarityTier;
  labelZh: string;
  multiplier: number;
  descZh: string;
}

export const RARITY: Record<RarityTier, RarityInfo> = {
  S: {
    tier: "S",
    labelZh: "夢幻逸品",
    multiplier: 4.0,
    descZh: "非賣品、活動會場限定完售、ラストワン賞這一級，幾乎不在市場上出現。",
  },
  A: {
    tier: "A",
    labelZh: "稀有",
    multiplier: 2.2,
    descZh: "已停售的限定款、抽選品，想收得靠代購或二手。",
  },
  B: {
    tier: "B",
    labelZh: "不易入手",
    multiplier: 1.4,
    descZh: "已停售的常規款，二手還找得到但價格站上定價。",
  },
  C: {
    tier: "C",
    labelZh: "普通",
    multiplier: 1.0,
    descZh: "現行品中的人氣款，定價上下浮動。",
  },
  D: {
    tier: "D",
    labelZh: "常見",
    multiplier: 0.8,
    descZh: "現行大量流通、會再販，隨時補得到貨。",
  },
};

export const RARITY_TIERS = Object.keys(RARITY) as RarityTier[];

/* ------------------------------------------------------------------ */

/**
 * 尺寸／型態。
 *
 * 產品線基準行情以 S 尺寸為準，其他尺寸用倍率換算。
 * 每個通路實際會出現哪些，寫在 channels.ts 的 sizeKeys。
 */
export type SizeKey = "mascot" | "ss" | "s" | "m" | "l" | "big" | "other_form" | "unknown";

export const SIZE: Record<SizeKey, { labelZh: string; descZh: string; multiplier: number }> = {
  mascot: { labelZh: "吊飾", descZh: "マスコット・ボールチェーン，掛包包的小型玩偶", multiplier: 0.55 },
  ss: { labelZh: "SS", descZh: "掌上型，約 10 公分以下", multiplier: 0.75 },
  s: { labelZh: "S", descZh: "標準尺寸，約 10–20 公分，估值基準", multiplier: 1.0 },
  m: { labelZh: "M", descZh: "約 20–30 公分", multiplier: 1.6 },
  l: { labelZh: "L", descZh: "約 30–45 公分", multiplier: 2.5 },
  big: { labelZh: "BIG／特大", descZh: "約 45 公分以上，抱枕級", multiplier: 3.8 },
  other_form: { labelZh: "其他造型", descZh: "玩偶包、零錢包、靠墊等玩偶周邊", multiplier: 1.1 },
  unknown: { labelZh: "不明", descZh: "無法判定尺寸", multiplier: 1.0 },
};

export const SIZE_KEYS = Object.keys(SIZE) as SizeKey[];

/* ------------------------------------------------------------------ */

/**
 * 正版查證。
 *
 * 吉伊卡哇玩偶的仿冒品非常多，查證狀態直接決定這隻玩偶在二手市場上有沒有人要。
 * 「未查證」「疑似仿冒」的扣分幅度由通路的 authenticitySensitivity 調節——
 * 官方店直購的未查證和夾娃娃機來路不明的未查證，風險不是同一回事。
 * 「確認仿冒」不縮放：假貨在哪個通路都是假貨。
 */
export type Authenticity = "verified" | "likely" | "unverified" | "suspicious" | "counterfeit";

export const AUTHENTICITY: Record<
  Authenticity,
  { labelZh: string; descZh: string; multiplier: number; scaled: boolean }
> = {
  verified: {
    labelZh: "已查證正版",
    descZh: "吊牌、布標、JAN 條碼與購入來源都對得上（例如官方店購買記錄）。",
    multiplier: 1.0,
    scaled: false,
  },
  likely: {
    labelZh: "大致可信",
    descZh: "吊牌與做工看起來沒問題，但沒有購買記錄可佐證。",
    multiplier: 0.92,
    scaled: true,
  },
  unverified: {
    labelZh: "未查證",
    descZh: "還沒比對過吊牌與做工，二手買家會壓價。",
    multiplier: 0.7,
    scaled: true,
  },
  suspicious: {
    labelZh: "疑似仿冒",
    descZh: "臉部刺繡比例、布料或吊牌印刷有可疑之處。",
    multiplier: 0.3,
    scaled: true,
  },
  counterfeit: {
    labelZh: "確認仿冒",
    descZh: "確定是仿冒品，沒有收藏行情。",
    multiplier: 0.05,
    scaled: false,
  },
};

export const AUTHENTICITY_LEVELS = Object.keys(AUTHENTICITY) as Authenticity[];

/* ------------------------------------------------------------------ */

/** 玩偶本體狀態。 */
export type Condition = "mint" | "near_mint" | "light_use" | "used" | "worn" | "damaged";

export const CONDITION: Record<Condition, { labelZh: string; abbr: string; multiplier: number; descZh: string }> = {
  mint: { labelZh: "全新", abbr: "M", multiplier: 1.0, descZh: "未使用，絨毛蓬鬆、刺繡完整、沒有任何污漬。" },
  near_mint: { labelZh: "近全新", abbr: "NM", multiplier: 0.9, descZh: "只拆來拍照或短暫擺飾，需近看才發現痕跡。" },
  light_use: { labelZh: "輕度使用", abbr: "LU", multiplier: 0.75, descZh: "擺飾過一段時間，絨毛略塌但乾淨。" },
  used: { labelZh: "使用痕跡", abbr: "U", multiplier: 0.55, descZh: "有起毛球、輕微髒污或褪色。" },
  worn: { labelZh: "明顯使用", abbr: "W", multiplier: 0.3, descZh: "抱過、掛過包包的狀態，扁塌與髒污明顯。" },
  damaged: { labelZh: "有損傷", abbr: "DM", multiplier: 0.15, descZh: "破洞、脫線、刺繡脫落或缺零件。" },
};

export const CONDITIONS = Object.keys(CONDITION) as Condition[];

/* ------------------------------------------------------------------ */

/** 吊牌狀態單獨評分 —— 同一隻玩偶，有沒有吊牌在二手市場差很多。 */
export type TagCondition = "sealed" | "tag_mint" | "tag_damaged" | "no_tag";

export const TAG_CONDITION: Record<TagCondition, { labelZh: string; multiplier: number; descZh: string }> = {
  sealed: { labelZh: "未拆袋", multiplier: 1.3, descZh: "原包裝袋未拆，吊牌完整，收藏價值最高。" },
  tag_mint: { labelZh: "吊牌完整", multiplier: 1.0, descZh: "已拆袋但紙吊牌仍掛著且平整。" },
  tag_damaged: { labelZh: "吊牌折損", multiplier: 0.8, descZh: "吊牌有折痕、破損，或已剪下另外保存（Mercari 常寫「タグ折れ」）。" },
  no_tag: { labelZh: "無吊牌", multiplier: 0.55, descZh: "吊牌已不在，也讓正版查證變得困難。" },
};

export const TAG_CONDITIONS = Object.keys(TAG_CONDITION) as TagCondition[];
