import { describe, expect, it } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { normalizeIdentification, RawIdentificationSchema, type RawIdentification } from "@/lib/ai/normalize";

function raw(overrides: Partial<RawIdentification> = {}): RawIdentification {
  return {
    name: "烏薩奇 討伐造型玩偶 S",
    nameOriginal: "うさぎ 討伐 ぬいぐるみS",
    character: "usagi",
    channel: "official_store",
    series: "official_limited",
    catalogNumber: "4550000000000",
    releaseYear: 2024,
    discontinued: true,
    isSpecialEdition: false,
    size: "s",
    authenticity: "likely",
    condition: "near_mint",
    tagCondition: "tag_mint",
    rarity: "B",
    confidence: 0.8,
    reasoningZh: "吊牌印有官方商店的商品資訊。",
    authenticityFlagsZh: [],
    cautionsZh: ["請確認吊牌背面的 JAN 條碼"],
    ...overrides,
  };
}

describe("normalizeIdentification", () => {
  it("乾淨的結果原樣通過，通路由產品線推導", () => {
    const { identification, coercedFields } = normalizeIdentification(raw());
    expect(coercedFields).toEqual([]);
    expect(identification.series).toBe("official_limited");
    expect(identification.channel).toBe("official_store");
    expect(identification.character).toBe("usagi");
    expect(identification.authenticity).toBe("likely");
  });

  it("大小寫與連字號的變體仍能對上，且不算作退回", () => {
    const { identification, coercedFields } = normalizeIdentification(
      raw({ character: "Usagi", series: "Official-Limited", condition: "NEAR MINT", tagCondition: "Tag Mint", rarity: "b" }),
    );
    expect(coercedFields).toEqual([]);
    expect(identification.series).toBe("official_limited");
    expect(identification.condition).toBe("near_mint");
    expect(identification.tagCondition).toBe("tag_mint");
    expect(identification.rarity).toBe("B");
  });

  it("完全對不上的分類退回保守值，並加註提醒", () => {
    const { identification, coercedFields } = normalizeIdentification(
      raw({ character: "皮卡丘", size: "巨無霸", authenticity: "大概是真的", tagCondition: "???" }),
    );
    expect(coercedFields).toEqual(expect.arrayContaining(["角色", "尺寸", "正版查證", "吊牌狀態"]));
    expect(identification.character).toBe("other");
    expect(identification.size).toBe("unknown");
    // 判斷不出查證狀態就當作沒查證，絕不往正版那邊靠
    expect(identification.authenticity).toBe("unverified");
    expect(identification.tagCondition).toBe("no_tag");
    expect(identification.cautionsZh.at(-1)).toContain("請自行複查");
  });

  it("模型說「已查證正版」時降為「大致可信」，並說明原因", () => {
    const { identification, coercedFields } = normalizeIdentification(raw({ authenticity: "verified" }));
    expect(identification.authenticity).toBe("likely");
    expect(coercedFields).toEqual([]);
    expect(identification.cautionsZh.some((c) => c.includes("無法確認正版"))).toBe(true);
  });

  it("疑似仿冒的判斷與疑點原樣保留", () => {
    const { identification } = normalizeIdentification(
      raw({ authenticity: "suspicious", authenticityFlagsZh: ["眼睛間距偏寬", "  ", "吊牌字型模糊"] }),
    );
    expect(identification.authenticity).toBe("suspicious");
    expect(identification.authenticityFlagsZh).toEqual(["眼睛間距偏寬", "吊牌字型模糊"]);
  });

  it("通路對得上但產品線對不上時，退到該通路的第一條產品線而不是未分類", () => {
    const { identification, coercedFields } = normalizeIdentification(
      raw({ channel: "ichiban_kuji", series: "kuji_z_prize" }),
    );
    expect(identification.series).toBe("kuji_top_prize");
    expect(coercedFields).toContain("產品線");
  });

  it("產品線與通路互相矛盾時，以通路為準重新挑產品線", () => {
    // 說是夾娃娃機景品，卻給了一番賞的產品線代號
    const { identification } = normalizeIdentification(raw({ channel: "prize", series: "kuji_top_prize" }));
    expect(identification.channel).toBe("prize");
    expect(identification.series).toBe("prize_regular");
  });

  it("通路與產品線都對不上時落到未分類", () => {
    const { identification, coercedFields } = normalizeIdentification(raw({ channel: "路邊攤", series: "不知道" }));
    expect(identification.series).toBe("other_unknown");
    expect(coercedFields).toContain("出處與產品線");
  });

  it("不合理的年份歸零，而不是拿去算年資加成", () => {
    expect(normalizeIdentification(raw({ releaseYear: 1985 })).identification.releaseYear).toBe(0);
    expect(normalizeIdentification(raw({ releaseYear: 2023.4 })).identification.releaseYear).toBe(2023);
  });

  it("信心度夾在 0 與 1 之間", () => {
    expect(normalizeIdentification(raw({ confidence: 1.7 })).identification.confidence).toBe(1);
    expect(normalizeIdentification(raw({ confidence: -0.2 })).identification.confidence).toBe(0);
  });

  it("空白名稱補上「無法判定」，避免存進一隻沒有名字的玩偶", () => {
    expect(normalizeIdentification(raw({ name: "  " })).identification.name).toBe("無法判定");
  });
});

describe("送給 Claude 的 output format", () => {
  it("產生合法的 JSON schema，且把可選值寫進欄位描述", () => {
    const format = betaZodOutputFormat(RawIdentificationSchema) as unknown as {
      type: string;
      schema: { type: string; required: string[]; properties: Record<string, { type: string; description?: string }> };
    };

    expect(format.type).toBe("json_schema");
    expect(format.schema.type).toBe("object");
    expect(format.schema.required).toContain("name");
    expect(format.schema.required).toContain("authenticityFlagsZh");
    // SDK 會把 enum 降級成 string，所以可選值必須自己寫在描述裡讓模型看得到
    expect(format.schema.properties.rarity.type).toBe("string");
    expect(format.schema.properties.rarity.description).toContain("S");
    expect(format.schema.properties.channel.description).toContain("ichiban_kuji");
    expect(format.schema.properties.character.description).toContain("hachiware");
    expect(format.schema.properties.tagCondition.description).toContain("no_tag");
    expect(format.schema.properties.authenticity.description).toContain("suspicious");
  });
});
