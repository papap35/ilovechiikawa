import { describe, expect, it } from "vitest";
import {
  CollectionItemInputSchema,
  CollectionItemPatchSchema,
  CollectionItemSchema,
  pickProvided,
} from "@/lib/plush/schema";
import { parseDataUrl } from "@/lib/ai/identify";
import { mockIdentification } from "@/lib/ai/mock";
import { getSeries, SERIES_KEYS } from "@/lib/plush/series";
import { RARITY_TIERS } from "@/lib/plush/grading";
import { CHARACTER_KEYS } from "@/lib/plush/characters";

describe("CollectionItemSchema", () => {
  it("只給必填欄位時，其餘套用預設值", () => {
    const item = CollectionItemSchema.parse({
      id: "abc",
      name: "測試玩偶",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(item.quantity).toBe(1);
    expect(item.rarity).toBe("C");
    expect(item.series).toBe("other_unknown");
    expect(item.tags).toEqual([]);
    expect(item.purchasePriceTwd).toBeNull();
    // 沒說查證過就是沒查證過，不能預設成正版
    expect(item.authenticity).toBe("unverified");
  });

  it("拒絕空白名稱", () => {
    expect(CollectionItemInputSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("拒絕不在枚舉內的稀有度", () => {
    const result = CollectionItemInputSchema.safeParse({ name: "玩偶", rarity: "SSS" });
    expect(result.success).toBe(false);
  });

  it("數量至少為 1", () => {
    expect(CollectionItemInputSchema.safeParse({ name: "玩偶", quantity: 0 }).success).toBe(false);
  });
});

describe("pickProvided", () => {
  it("只保留原始請求帶到的欄位", () => {
    const body = { rarity: "S", notes: "抽到的" };
    const parsed = CollectionItemPatchSchema.parse(body);
    // parse 後 zod 會把其他有預設值的欄位補上，pickProvided 要把它們濾掉
    expect(Object.keys(parsed).length).toBeGreaterThan(2);
    expect(pickProvided(parsed, body)).toEqual({ rarity: "S", notes: "抽到的" });
  });

  it("空物件與非物件都回傳空 patch", () => {
    const parsed = CollectionItemPatchSchema.parse({});
    expect(pickProvided(parsed, {})).toEqual({});
    expect(pickProvided(parsed, null)).toEqual({});
    expect(pickProvided(parsed, "字串")).toEqual({});
  });

  it("明確送 null 的欄位會被保留（用來清空購入價）", () => {
    const body = { purchasePriceTwd: null };
    const parsed = CollectionItemPatchSchema.parse(body);
    expect(pickProvided(parsed, body)).toEqual({ purchasePriceTwd: null });
  });
});

describe("CollectionItemPatchSchema", () => {
  it("所有欄位都可省略", () => {
    expect(CollectionItemPatchSchema.safeParse({}).success).toBe(true);
  });

  it("仍然拒絕空白名稱與非法枚舉值", () => {
    expect(CollectionItemPatchSchema.safeParse({ name: "" }).success).toBe(false);
    expect(CollectionItemPatchSchema.safeParse({ rarity: "SSS" }).success).toBe(false);
  });
});

describe("示範資料", () => {
  it("示範資料的產品線與分類都在目前的目錄中", () => {
    const mock = mockIdentification();
    expect(SERIES_KEYS).toContain(mock.series);
    expect(getSeries(mock.series).channel).toBe(mock.channel);
    expect(CHARACTER_KEYS).toContain(mock.character);
    // 示範資料也要守住「照片證明不了正版」的規則
    expect(mock.authenticity).not.toBe("verified");
    expect(RARITY_TIERS).toContain(mock.rarity);
  });
});

describe("parseDataUrl", () => {
  it("解析合法的 data URL", () => {
    const parsed = parseDataUrl("data:image/jpeg;base64,AAAA");
    expect(parsed).toEqual({ mediaType: "image/jpeg", data: "AAAA" });
  });

  it("容忍前後空白", () => {
    expect(parseDataUrl("  data:image/png;base64,BBBB  ")?.mediaType).toBe("image/png");
  });

  it("拒絕不支援的格式", () => {
    expect(parseDataUrl("data:image/svg+xml;base64,AAAA")).toBeNull();
    expect(parseDataUrl("data:application/pdf;base64,AAAA")).toBeNull();
  });

  it("拒絕非 data URL", () => {
    expect(parseDataUrl("https://example.com/a.jpg")).toBeNull();
    expect(parseDataUrl("")).toBeNull();
  });
});
