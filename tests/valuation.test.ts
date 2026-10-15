import { describe, expect, it } from "vitest";
import {
  scaledAuthenticityMultiplier,
  toValuationInput,
  valuate,
  vintageMultiplier,
  type ValuationInput,
} from "@/lib/plush/valuation";
import { CHANNELS, CHANNEL_KEYS, currencyRates } from "@/lib/plush/channels";
import { defaultSeriesForChannel, getSeries, SERIES, SERIES_KEYS, seriesForChannel } from "@/lib/plush/series";
import { AUTHENTICITY, SIZE } from "@/lib/plush/grading";

/** 一隻現行、已查證、全新、角色係數中性的官方常規款 S 尺寸，當作各項比較的基準。 */
const baseline: ValuationInput = {
  series: "official_regular",
  character: "yoroi",
  rarity: "C",
  size: "s",
  authenticity: "verified",
  condition: "mint",
  tagCondition: "tag_mint",
  isSpecialEdition: false,
  name: "鎧さん ぬいぐるみ",
  releaseYear: 2025,
  discontinued: false,
};

const opts = { rates: currencyRates(), now: new Date("2026-01-01T00:00:00Z") };
const value = (overrides: Partial<ValuationInput> = {}) => valuate({ ...baseline, ...overrides }, opts).midTwd;

describe("valuate", () => {
  it("全部係數中性時，估值等於產品線基準行情", () => {
    const result = valuate(baseline, opts);
    expect(result.baseTwd).toBe(550);
    expect(result.midTwd).toBe(550);
  });

  it("區間由中位數推導，兩端各自收斂", () => {
    const result = valuate(baseline, opts);
    expect(result.lowTwd).toBe(Math.round(result.midTwd * 0.75));
    expect(result.highTwd).toBe(Math.round(result.midTwd * 1.35));
  });

  it("稀有度愈高估值愈高", () => {
    const tiers = (["D", "C", "B", "A", "S"] as const).map((rarity) => value({ rarity }));
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
  });

  it("尺寸愈大估值愈高，吊飾低於標準尺寸", () => {
    const sizes = (["mascot", "ss", "s", "m", "l", "big"] as const).map((size) => value({ size }));
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
    expect(value({ size: "mascot" })).toBeLessThan(value());
  });

  it("吊牌從未拆袋掉到無吊牌，價值砍到一半以下", () => {
    const sealed = value({ tagCondition: "sealed" });
    const noTag = value({ tagCondition: "no_tag" });
    expect(noTag / sealed).toBeLessThan(0.5);
  });

  it("本體狀態愈差估值愈低", () => {
    const conditions = (["mint", "near_mint", "light_use", "used", "worn", "damaged"] as const).map((condition) =>
      value({ condition }),
    );
    expect(conditions).toEqual([...conditions].sort((a, b) => b - a));
  });

  it("人氣角色吃到加成，並附上理由", () => {
    const result = valuate({ ...baseline, character: "hachiware" }, opts);
    expect(result.midTwd).toBeGreaterThan(value());
    const factor = result.factors.find((f) => f.dimension === "character");
    expect(factor?.labelZh).toContain("小八");
    expect(factor?.detailZh).toBeTruthy();
  });

  it("造型主題用商品名或日文原名命中", () => {
    expect(value({ name: "ちいかわ 討伐 ぬいぐるみ" })).toBeGreaterThan(value());
    expect(value({ name: "", nameOriginal: "ハチワレ パジャマ" })).toBeGreaterThan(value({ name: "" }));
  });

  it("特別版只在該通路有這個概念時才計入", () => {
    const kuji = { series: "kuji_top_prize" };
    expect(value({ ...kuji, isSpecialEdition: true })).toBeGreaterThan(value(kuji));

    // 地區限定沒有特別版的概念，勾了也不該影響估值
    const gotochi = { series: "gotochi_regular" };
    expect(value({ ...gotochi, isSpecialEdition: true })).toBe(value(gotochi));
  });

  it("ラストワン賞的溢價高於官方抽選販售", () => {
    expect(CHANNELS.ichiban_kuji.specialVariant!.multiplier).toBeGreaterThan(
      CHANNELS.official_store.specialVariant!.multiplier,
    );
  });

  it("同樣規格下，一番賞上位賞比夾娃娃機一般景品值錢", () => {
    expect(value({ series: "kuji_top_prize" })).toBeGreaterThan(value({ series: "prize_regular" }));
  });

  it("停售才吃年資加成，現行品不吃", () => {
    expect(value({ releaseYear: 2022, discontinued: false })).toBe(value());
    expect(value({ releaseYear: 2022, discontinued: true })).toBeGreaterThan(value());
  });

  it("換算回通路的主要參考市場幣別", () => {
    const jp = valuate(baseline, opts);
    expect(jp.market.currency).toBe("JPY");
    expect(jp.market.mid).toBe(Math.round(jp.midTwd / opts.rates.JPY));

    const tw = valuate({ ...baseline, series: "tw_regular" }, opts);
    expect(tw.market.currency).toBe("TWD");
    expect(tw.market.mid).toBe(tw.midTwd);
  });

  it("不認得的產品線退回未分類，而不是丟例外", () => {
    const result = valuate({ ...baseline, series: "不存在的線" }, opts);
    expect(result.baseTwd).toBe(SERIES.other_unknown.baseValueTwd);
  });

  it("每一項係數都附理由與維度代號，估值才解釋得出來", () => {
    const result = valuate(
      { ...baseline, series: "kuji_top_prize", isSpecialEdition: true, discontinued: true, releaseYear: 2023 },
      opts,
    );
    for (const factor of result.factors) {
      expect(factor.dimension).toBeTruthy();
      expect(factor.dimensionLabelZh).toBeTruthy();
      expect(factor.detailZh).toBeTruthy();
      expect(factor.multiplier).toBeGreaterThan(0);
    }
    expect(result.factors.map((f) => f.dimension)).toEqual(expect.arrayContaining(["specialEdition", "vintage"]));
  });
});

describe("正版查證", () => {
  it("查證狀態愈差估值愈低", () => {
    const levels = (["verified", "likely", "unverified", "suspicious", "counterfeit"] as const).map((authenticity) =>
      value({ authenticity }),
    );
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
  });

  it("同樣是未查證，夾娃娃機景品扣得比官方商店重", () => {
    const prize = scaledAuthenticityMultiplier("unverified", CHANNELS.prize.authenticitySensitivity);
    const official = scaledAuthenticityMultiplier("unverified", CHANNELS.official_store.authenticitySensitivity);
    expect(prize).toBeLessThan(official);
    expect(prize).toBeCloseTo(AUTHENTICITY.unverified.multiplier);
  });

  it("確認仿冒不受通路縮放：假貨在哪個通路都幾乎沒有價值", () => {
    for (const key of CHANNEL_KEYS) {
      expect(scaledAuthenticityMultiplier("counterfeit", CHANNELS[key].authenticitySensitivity)).toBe(
        AUTHENTICITY.counterfeit.multiplier,
      );
    }
    // 就算是最貴的組合，仿冒品的估值也遠低於同款的正版
    const top = { series: "event_limited", rarity: "S" as const, size: "big" as const };
    expect(value({ ...top, authenticity: "counterfeit" })).toBeLessThan(value({ ...top }) * 0.1);
  });

  it("已查證正版不扣分", () => {
    expect(scaledAuthenticityMultiplier("verified", 1)).toBe(1);
  });

  it("不認得的查證等級當作未查證處理", () => {
    expect(value({ authenticity: "???" as never })).toBe(value({ authenticity: "unverified" }));
  });
});

describe("vintageMultiplier", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  it("每滿 1 年 +5%", () => {
    expect(vintageMultiplier(2024, true, now).multiplier).toBeCloseTo(1.1);
    expect(vintageMultiplier(2024, true, now).years).toBe(2);
  });

  it("上限 +30%", () => {
    expect(vintageMultiplier(2000, true, now).multiplier).toBe(1.3);
  });

  it("沒停售、沒年份或未來年份都不加成", () => {
    expect(vintageMultiplier(2020, false, now).multiplier).toBe(1);
    expect(vintageMultiplier(null, true, now).multiplier).toBe(1);
    expect(vintageMultiplier(2030, true, now).multiplier).toBe(1);
  });
});

describe("toValuationInput", () => {
  it("把辨識結果用 0 表示的未知年份轉成 null", () => {
    const input = toValuationInput({
      ...baseline,
      name: "x",
      nameOriginal: "",
      releaseYear: 0,
      discontinued: true,
    } as Parameters<typeof toValuationInput>[0]);
    expect(input.releaseYear).toBeNull();
  });
});

describe("目錄的一致性", () => {
  it("每個通路至少有一條產品線，預設產品線屬於該通路", () => {
    for (const key of CHANNEL_KEYS) {
      expect(seriesForChannel(key).length).toBeGreaterThan(0);
      expect(getSeries(defaultSeriesForChannel(key)).channel).toBe(key);
    }
  });

  it("每條產品線都掛在存在的通路上，基準行情為正數", () => {
    for (const key of SERIES_KEYS) {
      expect(CHANNEL_KEYS).toContain(SERIES[key].channel);
      expect(SERIES[key].baseValueTwd).toBeGreaterThan(0);
    }
  });

  it("每個通路的尺寸清單都包含「不明」，換通路時才有地方退", () => {
    for (const key of CHANNEL_KEYS) {
      expect(CHANNELS[key].sizeKeys).toContain("unknown");
      for (const size of CHANNELS[key].sizeKeys) expect(SIZE[size]).toBeDefined();
    }
  });

  it("仿冒風險參數落在 0–1 之間", () => {
    for (const key of CHANNEL_KEYS) {
      expect(CHANNELS[key].authenticitySensitivity).toBeGreaterThanOrEqual(0);
      expect(CHANNELS[key].authenticitySensitivity).toBeLessThanOrEqual(1);
    }
  });
});

describe("currencyRates", () => {
  it("可用環境變數覆寫日圓匯率，壞值則忽略", () => {
    process.env.CHIIKAWA_JPY_TWD = "0.25";
    expect(currencyRates().JPY).toBe(0.25);
    process.env.CHIIKAWA_JPY_TWD = "不是數字";
    expect(currencyRates().JPY).toBe(0.21);
    delete process.env.CHIIKAWA_JPY_TWD;
  });

  it("新台幣對自己永遠是 1", () => {
    expect(currencyRates().TWD).toBe(1);
  });
});
