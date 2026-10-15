import { z } from "zod";
import { SERIES_KEYS, FALLBACK_SERIES } from "./series";
import { CHARACTER_KEYS } from "./characters";
import {
  AUTHENTICITY_LEVELS,
  CONDITIONS,
  RARITY_TIERS,
  SIZE_KEYS,
  TAG_CONDITIONS,
} from "./grading";

const enumOf = <T extends string>(values: T[]) => z.enum(values as [T, ...T[]]);

/** 收藏庫中的一隻玩偶。通路由產品線推導，不另外存，避免兩份資料互相矛盾。 */
export const CollectionItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "商品名稱不可為空"),
  /** 日文原名，Mercari／駿河屋搜尋用 */
  nameOriginal: z.string().default(""),
  character: enumOf(CHARACTER_KEYS).default("other"),
  series: enumOf(SERIES_KEYS).default(FALLBACK_SERIES),
  /** 吊牌上的 JAN 條碼或商品編號 */
  catalogNumber: z.string().default(""),
  releaseYear: z.number().int().nullable().default(null),
  discontinued: z.boolean().default(false),
  /** 該通路的特別版（一番賞ラストワン賞／官方抽選販售…） */
  isSpecialEdition: z.boolean().default(false),
  size: enumOf(SIZE_KEYS).default("unknown"),
  authenticity: enumOf(AUTHENTICITY_LEVELS).default("unverified"),
  condition: enumOf(CONDITIONS).default("near_mint"),
  tagCondition: enumOf(TAG_CONDITIONS).default("tag_mint"),
  rarity: enumOf(RARITY_TIERS).default("C"),
  quantity: z.number().int().min(1).default(1),
  /** 購入價（新台幣）。未填為 null。 */
  purchasePriceTwd: z.number().nullable().default(null),
  purchaseDate: z.string().nullable().default(null),
  notes: z.string().default(""),
  tags: z.array(z.string()).default([]),
  /** 照片以 data URL 存放，方便離線瀏覽。 */
  photo: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CollectionItem = z.infer<typeof CollectionItemSchema>;

const EditableSchema = CollectionItemSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * 新增時可接受的欄位（id 與時間戳由伺服器產生）。
 * 未提供的欄位會套用 schema 的預設值。
 */
export const CollectionItemInputSchema = EditableSchema.partial().extend({
  name: z.string().min(1, "商品名稱必填"),
});

export type CollectionItemInput = z.infer<typeof CollectionItemInputSchema>;

/**
 * 更新時可接受的欄位（全部選填）。
 *
 * 注意：`.partial()` 只是讓欄位變成可省略，欄位缺席時 `.default()` 仍會把預設值填進來。
 * 所以呼叫端必須自行過濾出「使用者真的有送」的欄位再交給 store，
 * 否則一次只想改吊牌狀態的 PATCH 會把產品線、稀有度、購入價通通重設。
 * pickProvided() 就是做這件事。
 */
export const CollectionItemPatchSchema = EditableSchema.partial();

export type CollectionItemPatch = z.infer<typeof CollectionItemPatchSchema>;

/** 從驗證結果中，只挑出原始請求真的有帶到的欄位。 */
export function pickProvided(
  parsed: CollectionItemPatch,
  rawBody: unknown,
): CollectionItemPatch {
  if (typeof rawBody !== "object" || rawBody === null) return {};
  const sent = new Set(Object.keys(rawBody));
  return Object.fromEntries(
    Object.entries(parsed).filter(([key]) => sent.has(key)),
  ) as CollectionItemPatch;
}

/** Claude 看圖後的結構化辨識結果（正規化之後的形態）。 */
export interface Identification {
  name: string;
  nameOriginal: string;
  character: (typeof CHARACTER_KEYS)[number];
  channel: string;
  series: string;
  catalogNumber: string;
  releaseYear: number;
  discontinued: boolean;
  isSpecialEdition: boolean;
  size: (typeof SIZE_KEYS)[number];
  authenticity: (typeof AUTHENTICITY_LEVELS)[number];
  condition: (typeof CONDITIONS)[number];
  tagCondition: (typeof TAG_CONDITIONS)[number];
  rarity: (typeof RARITY_TIERS)[number];
  confidence: number;
  reasoningZh: string;
  /** 仿冒疑點：AI 在照片中看到、需要使用者親自比對的地方 */
  authenticityFlagsZh: string[];
  cautionsZh: string[];
}
