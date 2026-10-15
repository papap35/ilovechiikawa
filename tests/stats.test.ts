import { describe, expect, it } from "vitest";
import { computeStats, itemValueTwd } from "@/lib/plush/stats";
import { CollectionItemSchema, type CollectionItem } from "@/lib/plush/schema";

function makeItem(overrides: Partial<CollectionItem> = {}): CollectionItem {
  return CollectionItemSchema.parse({
    id: overrides.id ?? crypto.randomUUID(),
    name: "測試玩偶",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  });
}

describe("computeStats", () => {
  it("空收藏庫回傳全零而不是 NaN", () => {
    const stats = computeStats([]);
    expect(stats.totalItems).toBe(0);
    expect(stats.totalUnits).toBe(0);
    expect(stats.estimatedValueTwd).toBe(0);
    expect(stats.unrealizedGainTwd).toBe(0);
    expect(stats.unverifiedUnits).toBe(0);
    expect(stats.byCharacter).toEqual([]);
    expect(stats.topValued).toEqual([]);
  });

  it("數量會計入總隻數與總估值", () => {
    const item = makeItem({ quantity: 3 });
    const stats = computeStats([item]);
    expect(stats.totalItems).toBe(1);
    expect(stats.totalUnits).toBe(3);
    expect(stats.estimatedValueTwd).toBe(itemValueTwd(item) * 3);
  });

  it("角色分布依估值由高到低排序，同角色不同出處併在一起", () => {
    const stats = computeStats([
      makeItem({ character: "usagi", series: "official_regular" }),
      makeItem({ character: "usagi", series: "prize_regular" }),
      makeItem({ character: "rakko", series: "retail_regular", size: "mascot" }),
    ]);
    expect(stats.byCharacter.map((b) => b.key)).toEqual(["usagi", "rakko"]);
    expect(stats.byCharacter[0].count).toBe(2);
    expect(stats.byCharacter[0].labelZh).toBe("烏薩奇");
  });

  it("出處分布把同通路的不同產品線併在一起", () => {
    const stats = computeStats([
      makeItem({ series: "kuji_top_prize" }),
      makeItem({ series: "kuji_lower_prize" }),
      makeItem({ series: "prize_regular" }),
    ]);
    const kuji = stats.byChannel.find((b) => b.key === "ichiban_kuji");
    expect(kuji?.count).toBe(2);
    expect(stats.byChannel).toHaveLength(2);
  });

  it("損益只計算有填購入價的品項", () => {
    const costed = makeItem({ purchasePriceTwd: 200, quantity: 2 });
    const uncosted = makeItem({ purchasePriceTwd: null });
    const stats = computeStats([costed, uncosted]);
    expect(stats.investedTwd).toBe(400);
    expect(stats.itemsWithCost).toBe(1);
    expect(stats.unrealizedGainTwd).toBe(itemValueTwd(costed) * 2 - 400);
  });

  it("待查證隻數計入未查證與疑似仿冒，不計已查證、大致可信與確認仿冒", () => {
    const stats = computeStats([
      makeItem({ authenticity: "unverified", quantity: 2 }),
      makeItem({ authenticity: "suspicious" }),
      makeItem({ authenticity: "verified" }),
      makeItem({ authenticity: "likely" }),
      makeItem({ authenticity: "counterfeit" }),
    ]);
    expect(stats.unverifiedUnits).toBe(3);
  });

  it("估值區間涵蓋中位數", () => {
    const stats = computeStats([makeItem(), makeItem({ rarity: "S" })]);
    expect(stats.estimatedLowTwd).toBeLessThan(stats.estimatedValueTwd);
    expect(stats.estimatedHighTwd).toBeGreaterThan(stats.estimatedValueTwd);
  });

  it("產品線分布依估值由高到低排序", () => {
    const stats = computeStats([
      makeItem({ series: "prize_regular", rarity: "D" }),
      makeItem({ series: "event_limited", rarity: "A" }),
    ]);
    expect(stats.bySeries[0].key).toBe("event_limited");
    expect(stats.bySeries[0].labelZh).toContain("快閃店／活動限定");
  });

  it("稀有度分布固定依 S→D 排序，方便閱讀", () => {
    const stats = computeStats([
      makeItem({ rarity: "D" }),
      makeItem({ rarity: "S" }),
      makeItem({ rarity: "B" }),
    ]);
    expect(stats.byRarity.map((b) => b.key)).toEqual(["S", "B", "D"]);
  });

  it("估值排行取前五名且由高到低", () => {
    const items = (["D", "C", "B", "A", "S", "S"] as const).map((rarity, i) =>
      makeItem({ id: `id-${i}`, rarity }),
    );
    const stats = computeStats(items);
    expect(stats.topValued).toHaveLength(5);
    const values = stats.topValued.map((t) => t.valueTwd);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});
