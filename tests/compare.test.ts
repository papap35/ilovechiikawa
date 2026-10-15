import { describe, expect, it } from "vitest";
import { buildComparison, MAX_COMPARE_ITEMS } from "@/lib/plush/compare";
import { CollectionItemSchema, type CollectionItem } from "@/lib/plush/schema";
import { currencyRates } from "@/lib/plush/channels";

let counter = 0;

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  counter += 1;
  return CollectionItemSchema.parse({
    id: `item-${counter}`,
    name: `測試玩偶 ${counter}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

const opts = { rates: currencyRates(), now: new Date("2026-01-01T00:00:00Z") };

describe("buildComparison", () => {
  it("沒有項目時回傳空結構而不是爆掉", () => {
    const result = buildComparison([], opts);
    expect(result.entries).toEqual([]);
    expect(result.attributeRows).toEqual([]);
    expect(result.factorRows).toEqual([]);
    expect(result.topIndex).toBe(-1);
    expect(result.valueSpread).toBe(1);
  });

  it("標出估值最高的那一隻，並算出差距倍數", () => {
    const result = buildComparison(
      [
        makeItem({ series: "prize_regular", rarity: "D" }),
        makeItem({ series: "event_limited", rarity: "S" }),
        makeItem({ series: "retail_regular", rarity: "C" }),
      ],
      opts,
    );
    expect(result.topIndex).toBe(1);
    const values = result.entries.map((e) => e.valuation.midTwd);
    expect(result.valueSpread).toBeCloseTo(Math.max(...values) / Math.min(...values));
  });

  it("損益只在有購入價時計算", () => {
    const result = buildComparison(
      [makeItem({ purchasePriceTwd: 300 }), makeItem({ purchasePriceTwd: null })],
      opts,
    );
    expect(result.entries[0].gainTwd).toBe(result.entries[0].valuation.midTwd - 300);
    expect(result.entries[1].gainTwd).toBeNull();
  });

  it("相同的屬性列被標記為 identical，差異的不會", () => {
    const result = buildComparison(
      [
        makeItem({ character: "usagi", rarity: "C", condition: "mint" }),
        makeItem({ character: "usagi", rarity: "A", condition: "mint" }),
      ],
      opts,
    );
    expect(result.attributeRows.find((r) => r.labelZh === "稀有度")?.identical).toBe(false);
    expect(result.attributeRows.find((r) => r.labelZh === "本體狀態")?.identical).toBe(true);
    expect(result.attributeRows.find((r) => r.labelZh === "角色")?.identical).toBe(true);
  });

  it("同一個角色跨出處比較時，出處那一列顯示各自的通路名", () => {
    const result = buildComparison(
      [
        makeItem({ character: "hachiware", series: "official_regular" }),
        makeItem({ character: "hachiware", series: "prize_regular" }),
        makeItem({ character: "hachiware", series: "kuji_top_prize" }),
      ],
      opts,
    );
    const channelRow = result.attributeRows.find((r) => r.labelZh === "出處");
    expect(channelRow?.values).toEqual(["官方商店", "夾娃娃機景品", "一番賞"]);
    expect(channelRow?.identical).toBe(false);
  });

  it("係數列依造成的價差由大到小排序", () => {
    const result = buildComparison(
      [
        makeItem({ rarity: "D", size: "s", condition: "mint" }),
        makeItem({ rarity: "S", size: "m", condition: "mint" }),
      ],
      opts,
    );
    const spreads = result.factorRows.map((r) => r.spread);
    expect(spreads).toEqual([...spreads].sort((a, b) => b - a));
    expect(result.factorRows[0].dimension).toBe("rarity");
  });

  it("某一隻獨有的係數（例如ラストワン賞）也算得出價差，缺席的視為 1.0", () => {
    const result = buildComparison(
      [
        makeItem({ series: "kuji_top_prize", isSpecialEdition: true }),
        makeItem({ series: "kuji_top_prize", isSpecialEdition: false }),
      ],
      opts,
    );
    const special = result.factorRows.find((r) => r.dimension === "specialEdition");
    expect(special?.multipliers[0]).toBe(2.5);
    expect(special?.multipliers[1]).toBeNull();
    expect(special?.spread).toBe(2.5);
    expect(special?.identical).toBe(false);
  });

  it("查證狀態不同時，正版查證是拉開價差的係數之一", () => {
    const result = buildComparison(
      [
        makeItem({ series: "prize_regular", authenticity: "verified" }),
        makeItem({ series: "prize_regular", authenticity: "suspicious" }),
      ],
      opts,
    );
    expect(result.factorRows[0].dimension).toBe("authenticity");
  });

  it("完全相同的兩隻，所有係數列都標記為相同", () => {
    const spec = { series: "official_limited", rarity: "B" as const, character: "momonga" as const };
    const result = buildComparison([makeItem(spec), makeItem({ ...spec, name: "另一隻" })], opts);
    // 名稱不同會影響主題係數，這裡兩隻都沒命中主題清單，所以係數應全部相同
    expect(result.factorRows.every((r) => r.identical)).toBe(true);
  });

  it("每隻都算得出自己主要市場的幣別", () => {
    const result = buildComparison(
      [makeItem({ series: "official_regular" }), makeItem({ series: "tw_regular" })],
      opts,
    );
    expect(result.entries.map((e) => e.valuation.market.currency)).toEqual(["JPY", "TWD"]);
  });

  it("上限常數維持在 4，UI 的選取邏輯依賴它", () => {
    expect(MAX_COMPARE_ITEMS).toBe(4);
  });
});
