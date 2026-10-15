import { describe, expect, it } from "vitest";
import { CHARACTER_KEYS, CHARACTERS, getCharacter, THEME_RULES, themeDemandFor } from "@/lib/plush/characters";

describe("角色目錄", () => {
  it("每個角色都有中日文名稱、外觀線索與理由", () => {
    for (const key of CHARACTER_KEYS) {
      const info = CHARACTERS[key];
      expect(info.key).toBe(key);
      expect(info.nameZh).toBeTruthy();
      expect(info.nameJa).toBeTruthy();
      expect(info.lookZh).toBeTruthy();
      expect(info.reasonZh).toBeTruthy();
      expect(info.multiplier).toBeGreaterThan(0);
    }
  });

  it("主角三人的係數高於其他角色", () => {
    for (const key of ["chiikawa", "hachiware", "usagi"] as const) {
      expect(CHARACTERS[key].multiplier).toBeGreaterThan(CHARACTERS.other.multiplier);
    }
  });

  it("不認得的角色退回「其他角色」", () => {
    expect(getCharacter("皮卡丘").key).toBe("other");
    expect(getCharacter(null).key).toBe("other");
  });
});

describe("themeDemandFor", () => {
  it("沒有名稱時回傳中性係數", () => {
    expect(themeDemandFor().multiplier).toBe(1);
    expect(themeDemandFor("", null).multiplier).toBe(1);
  });

  it("一般造型維持中性", () => {
    expect(themeDemandFor("ちいかわ ぬいぐるみS").multiplier).toBe(1);
  });

  it("中日英文都能命中，且不分大小寫", () => {
    expect(themeDemandFor("ハチワレ 討伐").multiplier).toBeGreaterThan(1);
    expect(themeDemandFor("Usagi Christmas").multiplier).toBeGreaterThan(1);
    expect(themeDemandFor("吉伊卡哇 聖誕").multiplier).toBeGreaterThan(1);
  });

  it("命中多條規則時取係數最高的一條", () => {
    const combo = themeDemandFor("クリスマス 着ぐるみ");
    expect(combo.multiplier).toBe(Math.max(...THEME_RULES.filter((r) => r.keywords.some((k) => "クリスマス 着ぐるみ".includes(k))).map((r) => r.multiplier)));
  });

  it("扭蛋這類低於 1 的規則確實生效，不會被中性值蓋掉", () => {
    expect(themeDemandFor("ちいかわ ガチャ マスコット").multiplier).toBeLessThan(1);
  });

  it("每條規則都附了理由，估值才解釋得出來", () => {
    for (const rule of THEME_RULES) {
      expect(rule.reasonZh).toBeTruthy();
      expect(rule.keywords.length).toBeGreaterThan(0);
      // 關鍵字要是小寫，比對時才對得上
      for (const keyword of rule.keywords) expect(keyword).toBe(keyword.toLowerCase());
    }
  });
});
