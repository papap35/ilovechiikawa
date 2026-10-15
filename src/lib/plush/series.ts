/**
 * 各通路底下的產品線目錄。
 *
 * baseValueTwd = 該產品線「S 尺寸／全新／吊牌完整／已查證正版／一般角色」
 * 在二手市場的基準行情（新台幣）。估值引擎會再乘上稀有度、尺寸、正版查證、
 * 本體狀態、吊牌狀態、角色人氣、特別版、停售年資等係數。
 *
 * 產品線 key 以通路前綴命名，讓這份表在通路變多之後仍然讀得懂。
 * 數字是估計值，不是實際成交資料——設計成可以依自己觀察到的行情調整。
 */

import type { ChannelKey } from "./channels";

export interface SeriesInfo {
  key: string;
  channel: ChannelKey;
  nameZh: string;
  /** 日文原名，方便對照 Mercari／駿河屋標題 */
  nameOriginal: string;
  baseValueTwd: number;
  noteZh: string;
}

function def(
  key: string,
  channel: ChannelKey,
  nameZh: string,
  nameOriginal: string,
  baseValueTwd: number,
  noteZh: string,
): SeriesInfo {
  return { key, channel, nameZh, nameOriginal, baseValueTwd, noteZh };
}

const LIST: SeriesInfo[] = [
  /* ---------------- 官方商店 ---------------- */
  def("official_regular", "official_store", "官方常規款", "ちいかわマーケット 定番ぬいぐるみ", 550,
    "官方商店長期販售的常規玩偶，會再販，行情穩定。"),
  def("official_limited", "official_store", "期間／店舖限定", "期間限定・店舗限定", 800,
    "季節主題或ちいかわらんど店舖限定，販售期一過就不再生產。"),
  def("official_made_to_order", "official_store", "受注生產款", "受注生産", 500,
    "接單後生產，有下單的人都拿得到，所以溢價比限定款低。"),

  /* ---------------- 夾娃娃機景品 ---------------- */
  def("prize_regular", "prize", "一般景品", "プライズ ぬいぐるみ", 300,
    "全國遊樂場投放的景品玩偶，量大，但也是仿冒最多的一類。"),
  def("prize_premium", "prize", "高階景品", "プライズ プレミアム／BIG", 450,
    "做工與尺寸較講究的高階景品，常是大型或特殊造型。"),

  /* ---------------- 一番賞 ---------------- */
  def("kuji_top_prize", "ichiban_kuji", "上位賞", "一番くじ 上位賞（A賞・B賞など）", 650,
    "一番賞的大獎，多為大型玩偶，一套籤只有少數幾個。"),
  def("kuji_lower_prize", "ichiban_kuji", "下位賞", "一番くじ 下位賞", 280,
    "籤數多的下位賞，以吊飾與小型玩偶為主，常出現整套收購。"),

  /* ---------------- 快閃店／活動 ---------------- */
  def("popup_limited", "popup_event", "快閃店限定", "POP UP STORE 限定", 800,
    "期間限定快閃店的限定商品，巡迴各地但每站數量有限。"),
  def("event_limited", "popup_event", "活動會場限定", "イベント会場限定", 950,
    "展覽、紀念活動會場限定，只在檔期內現場販售。"),

  /* ---------------- 地區限定 ---------------- */
  def("gotochi_regular", "gotochi", "地區限定款", "ご当地 ぬいぐるみ／マスコット", 600,
    "結合當地名產或景點造型，海外收藏者多半只能靠代購。"),

  /* ---------------- 一般零售 ---------------- */
  def("retail_regular", "retail", "一般零售款", "ぬいぐるみ（一般流通）", 450,
    "授權商在一般通路販售的常規玩偶。"),

  /* ---------------- 聯名 ---------------- */
  def("collab_goods", "collab", "聯名販售款", "コラボ商品", 650,
    "與其他品牌聯名、在通路販售的商品。"),
  def("collab_novelty", "collab", "聯名贈品", "コラボ ノベルティ", 900,
    "集點、抽獎或消費贈送，不單獨販售。"),

  /* ---------------- 台灣授權 ---------------- */
  def("tw_regular", "taiwan_licensed", "台灣授權常規款", "台湾正規品", 420,
    "台灣代理商授權的常規商品。"),
  def("tw_promo", "taiwan_licensed", "台灣活動／集點款", "台湾キャンペーン限定", 380,
    "超商集點、快閃活動等台灣限定取得方式。"),

  def("other_unknown", "other", "未分類", "Unknown", 400,
    "出處或產品線無法判定，估值僅供大略參考。"),
];

export const SERIES: Record<string, SeriesInfo> = Object.fromEntries(
  LIST.map((info) => [info.key, info]),
);

export const SERIES_KEYS = LIST.map((info) => info.key);

export const FALLBACK_SERIES = "other_unknown";

export function getSeries(key: string | null | undefined): SeriesInfo {
  return SERIES[key ?? FALLBACK_SERIES] ?? SERIES[FALLBACK_SERIES];
}

/** 某個通路底下的所有產品線，順序即目錄中的定義順序。 */
export function seriesForChannel(channel: ChannelKey): SeriesInfo[] {
  return LIST.filter((info) => info.channel === channel);
}

/** 該通路的預設產品線（目錄中的第一條），用於只知道通路時的退路。 */
export function defaultSeriesForChannel(channel: ChannelKey): string {
  return seriesForChannel(channel)[0]?.key ?? FALLBACK_SERIES;
}
