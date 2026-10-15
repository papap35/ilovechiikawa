import { z } from "zod";
import { defaultSeriesForChannel, FALLBACK_SERIES, getSeries, SERIES_KEYS } from "../plush/series";
import { CHANNEL_KEYS, type ChannelKey } from "../plush/channels";
import { CHARACTER_KEYS, type CharacterKey } from "../plush/characters";
import {
  AUTHENTICITY_LEVELS,
  CONDITIONS,
  RARITY_TIERS,
  SIZE_KEYS,
  TAG_CONDITIONS,
  type Authenticity,
  type Condition,
  type RarityTier,
  type SizeKey,
  type TagCondition,
} from "../plush/grading";
import type { Identification } from "../plush/schema";

/**
 * 模型回傳的原始結果，分類欄位一律先當成字串收下。
 *
 * 原因：SDK 把 Zod enum 轉成 JSON schema 時，會降級成 `type: "string"`，
 * 只把可選值寫進 description。也就是說 API 並不會硬性限制回傳值——
 * 模型偶爾回 "Hachiware" 或 "Near Mint" 這種變體是完全可能的。
 * 若直接用嚴格 enum 解析，一次小小的拼法差異就會讓整張照片的辨識結果作廢。
 * 這裡先寬容收下，再由 normalizeIdentification() 正規化。
 */
export const RawIdentificationSchema = z.object({
  name: z.string().describe("商品名稱，例如「吉伊卡哇 討伐造型玩偶 S」。無法判斷時寫「無法判定」。"),
  nameOriginal: z.string().describe("吊牌上的日文商品名，例如「ちいかわ ぬいぐるみS」。看不到就留空字串。"),
  character: z.string().describe(`角色，必須是以下其中之一：${CHARACTER_KEYS.join("、")}`),
  channel: z.string().describe(`出處／通路，必須是以下其中之一：${CHANNEL_KEYS.join("、")}`),
  series: z.string().describe("該通路的產品線代號，必須取自系統提示詞的通路目錄，且需與 channel 一致。"),
  catalogNumber: z.string().describe("吊牌上的 JAN 條碼數字或商品編號。看不到就留空字串。"),
  releaseYear: z.number().describe("推估發售年份（西元，2020–2100）。完全無法判斷時填 0。"),
  discontinued: z.boolean().describe("是否已停售（限定期已過、不再販售）。"),
  isSpecialEdition: z
    .boolean()
    .describe("是否為該通路的特別版（一番賞ラストワン賞／官方抽選販售／聯名非賣品等）。"),
  size: z.string().describe(`尺寸，必須是以下其中之一：${SIZE_KEYS.join("、")}`),
  authenticity: z
    .string()
    .describe(`正版查證判斷，必須是以下其中之一：${AUTHENTICITY_LEVELS.join("、")}。光看照片最多只能給到 likely。`),
  condition: z.string().describe(`玩偶本體狀態，必須是以下其中之一：${CONDITIONS.join("、")}`),
  tagCondition: z
    .string()
    .describe(`吊牌狀態，必須是以下其中之一：${TAG_CONDITIONS.join("、")}。照片中看不到吊牌時填 no_tag。`),
  rarity: z.string().describe(`稀有度分級，必須是 ${RARITY_TIERS.join("、")} 其中之一。`),
  confidence: z.number().describe("辨識信心度，0 到 1 之間的小數。"),
  reasoningZh: z.string().describe("用繁體中文說明判斷依據：從照片中看到哪些線索得出這個結論。"),
  authenticityFlagsZh: z
    .array(z.string())
    .describe("照片中看到的仿冒疑點，例如「眼睛刺繡間距偏寬」。沒看到疑點就給空陣列。"),
  cautionsZh: z
    .array(z.string())
    .describe("提醒使用者需要親自確認的地方，例如「請拍吊牌背面確認 JAN 條碼」。至少給一項。"),
});

export type RawIdentification = z.infer<typeof RawIdentificationSchema>;

/**
 * 把模型回傳的字串對上枚舉值。
 * 允許大小寫、連字號／空白／底線的差異；完全對不上時回傳 null。
 */
function matchEnum<T extends string>(value: string, allowed: readonly T[]): T | null {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return allowed.find((option) => option.toLowerCase() === normalized) ?? null;
}

export interface NormalizeResult {
  identification: Identification;
  /** 有哪些欄位是因為對不上枚舉而退回預設值，用來提醒使用者複查。 */
  coercedFields: string[];
}

export function normalizeIdentification(raw: RawIdentification): NormalizeResult {
  const coerced: string[] = [];

  const pick = <T extends string>(
    field: string,
    value: string,
    allowed: readonly T[],
    fallback: T,
  ): T => {
    const hit = matchEnum(value, allowed);
    if (hit === null) {
      coerced.push(field);
      return fallback;
    }
    return hit;
  };

  const channel = matchEnum(raw.channel, CHANNEL_KEYS);
  const seriesHit = matchEnum(raw.series, SERIES_KEYS);

  // 產品線是價差的主要來源，所以退路分三層：
  // 產品線對得上就用它；對不上但通路對得上，就退到該通路的第一條產品線；
  // 兩個都對不上才落到「未分類」。
  let series: string;
  if (seriesHit && (!channel || getSeries(seriesHit).channel === channel)) {
    series = seriesHit;
  } else if (channel) {
    series = defaultSeriesForChannel(channel);
    coerced.push("產品線");
  } else {
    series = FALLBACK_SERIES;
    coerced.push("出處與產品線");
  }

  const character = pick<CharacterKey>("角色", raw.character, CHARACTER_KEYS, "other");
  const size = pick<SizeKey>("尺寸", raw.size, SIZE_KEYS, "unknown");
  const condition = pick<Condition>("本體狀態", raw.condition, CONDITIONS, "used");
  const tagCondition = pick<TagCondition>("吊牌狀態", raw.tagCondition, TAG_CONDITIONS, "no_tag");
  const rarity = pick<RarityTier>("稀有度", raw.rarity, RARITY_TIERS, "C");
  let authenticity = pick<Authenticity>("正版查證", raw.authenticity, AUTHENTICITY_LEVELS, "unverified");

  const cautions = [...raw.cautionsZh];

  // 照片證明不了正版：吊牌可以仿、做工可以仿，「已查證」需要購買記錄或實物比對。
  // 模型就算很有把握，也只讓它給到「大致可信」，最後一步留給使用者。
  if (authenticity === "verified") {
    authenticity = "likely";
    cautions.push("AI 只看照片無法確認正版，已標為「大致可信」。核對過購買記錄或實物後，可自行改為「已查證正版」。");
  }

  const year = Math.round(raw.releaseYear);
  const releaseYear = year >= 2020 && year <= 2100 ? year : 0;

  if (coerced.length > 0) {
    cautions.push(`以下欄位的辨識結果無法對應到標準分類，已改用保守值，請自行複查：${coerced.join("、")}。`);
  }

  const resolvedChannel: ChannelKey = getSeries(series).channel;

  return {
    identification: {
      name: raw.name.trim() || "無法判定",
      nameOriginal: raw.nameOriginal.trim(),
      character,
      channel: resolvedChannel,
      series,
      catalogNumber: raw.catalogNumber.trim(),
      releaseYear,
      discontinued: raw.discontinued,
      isSpecialEdition: raw.isSpecialEdition,
      size,
      authenticity,
      condition,
      tagCondition,
      rarity,
      confidence: Math.min(1, Math.max(0, raw.confidence)),
      reasoningZh: raw.reasoningZh.trim(),
      authenticityFlagsZh: raw.authenticityFlagsZh.map((flag) => flag.trim()).filter(Boolean),
      cautionsZh: cautions,
    },
    coercedFields: coerced,
  };
}
