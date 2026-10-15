/**
 * 吉伊卡哇（ちいかわ）玩偶的出處／通路目錄。
 *
 * 同一隻吉伊卡哇，從官方店、夾娃娃機、一番賞出來的，行情可以差好幾倍。
 * 而且每個通路的規矩都不一樣，這裡把差異寫成資料而不是散在各處的 if：
 *
 * - **「特別版」的概念不同**：一番賞是ラストワン賞，官方店是抽選販售，
 *   聯名活動是非賣品贈品。溢價幅度差很多。
 * - **仿冒風險不同**：夾娃娃機景品與一番賞大獎是仿冒重災區，官方店直購的風險低很多。
 *   用 authenticitySensitivity 調整「未查證」這件事對行情的影響力。
 * - **尺寸不同**：一番賞上位賞多是大型玩偶，下位賞多是吊飾，表單只列該通路會出現的尺寸。
 * - **參考市場不同**：日本出處看 Mercari／駿河屋（JPY），台灣授權商品看蝦皮（TWD）。
 */

import type { SizeKey } from "./grading";

export type ChannelKey =
  | "official_store"
  | "prize"
  | "ichiban_kuji"
  | "popup_event"
  | "gotochi"
  | "retail"
  | "collab"
  | "taiwan_licensed"
  | "other";

export type MarketCurrency = "JPY" | "TWD";

export interface SpecialVariant {
  /** 完整名稱，表單與明細用 */
  labelZh: string;
  /** 卡片徽章用的短標籤 */
  shortZh: string;
  multiplier: number;
  descZh: string;
}

export interface ChannelInfo {
  key: ChannelKey;
  nameZh: string;
  /** 日文原名，方便對照 Mercari／駿河屋標題 */
  nameJa: string;
  /** 吊牌上通常看得到的線索，辨識與手動判斷都用得到 */
  tagHintZh: string;
  /** 二手行情的主要參考市場幣別 */
  marketCurrency: MarketCurrency;
  /**
   * 這個通路的仿冒風險（0–1）。
   * 1 = 仿冒重災區，「未查證」會被重扣；0 = 幾乎沒有仿冒流通，查不查證影響不大。
   * 「確認仿冒」不受這個參數影響——假貨就是假貨。
   */
  authenticitySensitivity: number;
  /** 這個通路的「特別版」概念。沒有這種文化的通路為 null。 */
  specialVariant: SpecialVariant | null;
  /** 這個通路實際會出現的尺寸，表單只列這些選項 */
  sizeKeys: SizeKey[];
  noteZh: string;
}

export const CHANNELS: Record<ChannelKey, ChannelInfo> = {
  official_store: {
    key: "official_store",
    nameZh: "官方商店",
    nameJa: "ちいかわマーケット／ちいかわらんど",
    tagHintZh: "紙吊牌印有官方商店的商品資訊與 JAN 條碼，布標有 ©nagano 字樣。",
    marketCurrency: "JPY",
    authenticitySensitivity: 0.5,
    specialVariant: {
      labelZh: "抽選販售",
      shortZh: "抽選",
      multiplier: 1.8,
      descZh: "需抽選才能購買的商品，供給量受限，二手市場溢價明顯。",
    },
    sizeKeys: ["mascot", "ss", "s", "m", "l", "big", "other_form", "unknown"],
    noteZh: "線上的ちいかわマーケット與實體店ちいかわらんど，官方原創商品的主要來源。",
  },
  prize: {
    key: "prize",
    nameZh: "夾娃娃機景品",
    nameJa: "プライズ",
    tagHintZh: "吊牌通常標示為景品專用（例如「非売品」「プライズ」字樣），沒有零售條碼。",
    marketCurrency: "JPY",
    authenticitySensitivity: 1,
    specialVariant: {
      labelZh: "店舖限定景品",
      shortZh: "店限",
      multiplier: 1.4,
      descZh: "只在特定遊樂場連鎖投放的景品，流通量比全國投放的少。",
    },
    sizeKeys: ["mascot", "s", "m", "l", "big", "other_form", "unknown"],
    noteZh: "夾娃娃機的景品，投放量大但也是仿冒品最多的一塊，查證比什麼都重要。",
  },
  ichiban_kuji: {
    key: "ichiban_kuji",
    nameZh: "一番賞",
    nameJa: "一番くじ",
    tagHintZh: "吊牌有一番くじ標誌與賞別（A賞、B賞、ラストワン賞…）。",
    marketCurrency: "JPY",
    authenticitySensitivity: 0.9,
    specialVariant: {
      labelZh: "ラストワン賞",
      shortZh: "最後賞",
      multiplier: 2.5,
      descZh: "抽到該店最後一抽才拿得到，每家店只有一個，是一番賞的稀有度天花板。",
    },
    sizeKeys: ["mascot", "s", "m", "l", "big", "other_form", "unknown"],
    noteZh: "上位賞多是大型玩偶，下位賞多是吊飾與小物。賞別決定行情。",
  },
  popup_event: {
    key: "popup_event",
    nameZh: "快閃店／活動限定",
    nameJa: "POP UP STORE・イベント限定",
    tagHintZh: "吊牌或包裝上有活動名稱、會場名或「限定」字樣。",
    marketCurrency: "JPY",
    authenticitySensitivity: 0.7,
    specialVariant: {
      labelZh: "會場購買特典",
      shortZh: "特典",
      multiplier: 1.6,
      descZh: "滿額或指定商品附贈、不單獨販售的特典版本。",
    },
    sizeKeys: ["mascot", "ss", "s", "m", "other_form", "unknown"],
    noteZh: "期間限定快閃店與活動會場限定商品，檔期一過就只能找二手。",
  },
  gotochi: {
    key: "gotochi",
    nameZh: "地區限定",
    nameJa: "ご当地",
    tagHintZh: "吊牌標示地名，造型通常結合當地名產或景點。",
    marketCurrency: "JPY",
    authenticitySensitivity: 0.5,
    specialVariant: null,
    sizeKeys: ["mascot", "ss", "s", "other_form", "unknown"],
    noteZh: "只在特定觀光地、機場或車站販售的地區限定款，以吊飾尺寸為主。",
  },
  retail: {
    key: "retail",
    nameZh: "一般零售通路",
    nameJa: "一般流通（雑貨店・書店など）",
    tagHintZh: "吊牌有授權商名稱與零售 JAN 條碼。",
    marketCurrency: "JPY",
    authenticitySensitivity: 0.6,
    specialVariant: null,
    sizeKeys: ["mascot", "ss", "s", "m", "l", "other_form", "unknown"],
    noteZh: "雜貨店、玩具店、書店等授權通路販售的常規商品，補貨相對容易。",
  },
  collab: {
    key: "collab",
    nameZh: "品牌聯名",
    nameJa: "コラボ",
    tagHintZh: "吊牌或布標同時印有聯名品牌名稱。",
    marketCurrency: "JPY",
    authenticitySensitivity: 0.6,
    specialVariant: {
      labelZh: "聯名非賣品",
      shortZh: "非賣",
      multiplier: 2,
      descZh: "集點兌換、抽獎或消費贈送，不在任何通路販售。",
    },
    sizeKeys: ["mascot", "ss", "s", "m", "l", "other_form", "unknown"],
    noteZh: "與其他品牌合作的聯名商品，聯名造型本身就是賣點。",
  },
  taiwan_licensed: {
    key: "taiwan_licensed",
    nameZh: "台灣授權商品",
    nameJa: "台湾正規ライセンス",
    tagHintZh: "中文吊牌，標示台灣授權代理商與進口商資訊。",
    marketCurrency: "TWD",
    authenticitySensitivity: 0.7,
    specialVariant: {
      labelZh: "集點／活動限定",
      shortZh: "集點",
      multiplier: 1.5,
      descZh: "超商集點、快閃活動等台灣在地限定的取得方式。",
    },
    sizeKeys: ["mascot", "ss", "s", "m", "l", "big", "other_form", "unknown"],
    noteZh: "台灣代理商授權販售的商品，中文吊牌是最直接的辨識線索。",
  },
  other: {
    key: "other",
    nameZh: "其他／不明",
    nameJa: "その他",
    tagHintZh: "無法從吊牌判斷出處。",
    marketCurrency: "JPY",
    authenticitySensitivity: 0.8,
    specialVariant: {
      labelZh: "限定版",
      shortZh: "限定",
      multiplier: 1.5,
      descZh: "限定或非賣品。",
    },
    sizeKeys: ["mascot", "ss", "s", "m", "l", "big", "other_form", "unknown"],
    noteZh: "出處無法判定，估值僅供大略參考。",
  },
};

export const CHANNEL_KEYS = Object.keys(CHANNELS) as ChannelKey[];

export function getChannel(key: string | null | undefined): ChannelInfo {
  return CHANNELS[(key ?? "other") as ChannelKey] ?? CHANNELS.other;
}

/** 各參考市場對新台幣的匯率。可用環境變數覆寫。 */
const DEFAULT_RATES: Record<MarketCurrency, number> = {
  JPY: 0.21,
  TWD: 1,
};

const RATE_ENV_KEYS: Partial<Record<MarketCurrency, string>> = {
  JPY: "CHIIKAWA_JPY_TWD",
};

export type CurrencyRates = Record<MarketCurrency, number>;

/**
 * 讀取匯率設定。只有伺服器端讀得到環境變數，
 * 客戶端要即時重算估值時，請把伺服器算好的匯率傳進 valuate()。
 */
export function currencyRates(): CurrencyRates {
  const rates = { ...DEFAULT_RATES };
  for (const currency of Object.keys(rates) as MarketCurrency[]) {
    const envKey = RATE_ENV_KEYS[currency];
    if (!envKey) continue;
    const raw = typeof process !== "undefined" ? process.env[envKey] : undefined;
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && parsed > 0) rates[currency] = parsed;
  }
  return rates;
}

export const CURRENCY_SYMBOL: Record<MarketCurrency, string> = {
  JPY: "¥",
  TWD: "NT$",
};
