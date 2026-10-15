/**
 * 角色與主題人氣。
 *
 * 同一個產品線、同樣狀態，不同角色的二手行情不會一樣。角色是明確的欄位，
 * 直接查表；造型主題（變裝、季節款…）則用關鍵字比對商品名稱。
 * 兩者都會回傳理由，讓估值可以被解釋。
 *
 * 係數是估計值，用來表達「圈內大概的熱度差」，不是成交統計——
 * 依自己觀察到的市場狀況調整即可，測試只守住相對關係。
 */

export type CharacterKey =
  | "chiikawa"
  | "hachiware"
  | "usagi"
  | "momonga"
  | "kurimanju"
  | "rakko"
  | "shisa"
  | "furuhonya"
  | "yoroi"
  | "group"
  | "other";

export interface CharacterInfo {
  key: CharacterKey;
  nameZh: string;
  nameJa: string;
  multiplier: number;
  /** 辨識與手動判斷用的外觀線索 */
  lookZh: string;
  reasonZh: string;
}

export const CHARACTERS: Record<CharacterKey, CharacterInfo> = {
  chiikawa: {
    key: "chiikawa",
    nameZh: "吉伊卡哇",
    nameJa: "ちいかわ",
    multiplier: 1.25,
    lookZh: "白色、圓耳朵、臉頰有腮紅。",
    reasonZh: "作品主角，需求穩定且廣。",
  },
  hachiware: {
    key: "hachiware",
    nameZh: "小八",
    nameJa: "ハチワレ",
    multiplier: 1.3,
    lookZh: "白色貓型，頭頂有藍色八字分線花紋。",
    reasonZh: "人氣最高的角色之一，常是同系列最先賣完的。",
  },
  usagi: {
    key: "usagi",
    nameZh: "烏薩奇",
    nameJa: "うさぎ",
    multiplier: 1.3,
    lookZh: "黃色長耳兔，表情誇張。",
    reasonZh: "人氣最高的角色之一，表情款特別搶手。",
  },
  momonga: {
    key: "momonga",
    nameZh: "小桃",
    nameJa: "モモンガ",
    multiplier: 1.15,
    lookZh: "白色鼯鼠，大眼睛、有飛膜。",
    reasonZh: "粉絲黏著度高，商品數量比主角三人少。",
  },
  kurimanju: {
    key: "kurimanju",
    nameZh: "栗子饅頭",
    nameJa: "くりまんじゅう",
    multiplier: 1.1,
    lookZh: "栗子饅頭色的大叔型角色，常與酒和下酒菜一起出現。",
    reasonZh: "配角中的人氣王，商品化數量相對少。",
  },
  rakko: {
    key: "rakko",
    nameZh: "海獺",
    nameJa: "ラッコ",
    multiplier: 1.2,
    lookZh: "灰褐色海獺，頭戴帽子，是討伐高手。",
    reasonZh: "強者形象深植人心，商品少而搶手。",
  },
  shisa: {
    key: "shisa",
    nameZh: "獅薩",
    nameJa: "シーサー",
    multiplier: 1.05,
    lookZh: "沖繩風獅爺造型，有鬃毛。",
    reasonZh: "後期登場的角色，粉絲穩定成長中。",
  },
  furuhonya: {
    key: "furuhonya",
    nameZh: "古書店老闆",
    nameJa: "古本屋",
    multiplier: 1.05,
    lookZh: "古書店的店主角色。",
    reasonZh: "配角，商品化稀少，有特定收藏客層。",
  },
  yoroi: {
    key: "yoroi",
    nameZh: "鎧甲人",
    nameJa: "鎧さん",
    multiplier: 1.0,
    lookZh: "穿著鎧甲的角色，有多種職業版本。",
    reasonZh: "配角，以中性行情計算。",
  },
  group: {
    key: "group",
    nameZh: "多角色組合",
    nameJa: "セット",
    multiplier: 1.15,
    lookZh: "同一件商品上有兩個以上角色，或成套販售。",
    reasonZh: "成套商品湊齊不易，整組價值高於拆開。",
  },
  other: {
    key: "other",
    nameZh: "其他角色",
    nameJa: "その他",
    multiplier: 0.95,
    lookZh: "以上沒有列到的角色。",
    reasonZh: "較少見的角色，需求較窄。",
  },
};

export const CHARACTER_KEYS = Object.keys(CHARACTERS) as CharacterKey[];

export function getCharacter(key: string | null | undefined): CharacterInfo {
  return CHARACTERS[(key ?? "other") as CharacterKey] ?? CHARACTERS.other;
}

/* ------------------------------------------------------------------ */

export interface ThemeRule {
  /** 比對用關鍵字（小寫），商品名或日文原名命中任一即可 */
  keywords: string[];
  multiplier: number;
  reasonZh: string;
}

export const THEME_RULES: ThemeRule[] = [
  {
    keywords: ["討伐", "とうばつ", "草むしり", "除草"],
    multiplier: 1.15,
    reasonZh: "討伐、除草是作品的招牌橋段，相關造型粉絲買單度高",
  },
  {
    keywords: ["着ぐるみ", "きぐるみ", "パジャマ", "睡衣", "變裝", "コスチューム", "cosplay"],
    multiplier: 1.1,
    reasonZh: "變裝造型是玩偶收藏的熱門主題",
  },
  {
    keywords: ["ご当地", "地區限定", "名產", "名物"],
    multiplier: 1.1,
    reasonZh: "地區名產造型有獨立的收藏客層",
  },
  {
    keywords: ["クリスマス", "christmas", "聖誕", "お正月", "新年", "ハロウィン", "halloween", "萬聖", "バレンタイン", "情人節"],
    multiplier: 1.05,
    reasonZh: "節慶款檔期短，過季後反而不好買",
  },
  {
    keywords: ["福袋", "ガチャ", "扭蛋", "カプセル"],
    multiplier: 0.9,
    reasonZh: "扭蛋與福袋出品量大，單隻行情偏平",
  },
];

export interface DemandResult {
  multiplier: number;
  reasonZh: string;
}

/**
 * 依商品名稱判斷造型主題係數。
 *
 * 命中多條規則時取係數最高的那條（例如「聖誕變裝」算變裝的盤）。
 * 完全沒命中才回中性的 1.0 —— 注意要在「命中的規則之間」比大小，
 * 否則像扭蛋那種低於 1.0 的規則會被中性值蓋掉，永遠生效不了。
 */
export function themeDemandFor(...names: (string | null | undefined)[]): DemandResult {
  const haystack = names.filter(Boolean).join(" ").toLowerCase();
  if (!haystack.trim()) {
    return { multiplier: 1.0, reasonZh: "商品名稱不足以判斷主題，以中性行情計算" };
  }

  const matched = THEME_RULES.filter((rule) => rule.keywords.some((k) => haystack.includes(k)));
  if (matched.length === 0) {
    return { multiplier: 1.0, reasonZh: "一般造型，以中性行情計算" };
  }

  const best = matched.reduce((a, b) => (b.multiplier > a.multiplier ? b : a));
  return { multiplier: best.multiplier, reasonZh: best.reasonZh };
}
