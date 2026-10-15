import type { Identification } from "../plush/schema";

/**
 * 沒有 API key 時使用的示範資料。
 *
 * 刻意挑一隻有代表性的玩偶（一番賞上位賞、人氣角色、多項係數都會觸發），
 * 讓使用者第一次打開就能看懂這個工具在算什麼。
 */
export function mockIdentification(): Identification {
  return {
    name: "小八 一番賞 A賞 大型玩偶",
    nameOriginal: "一番くじ ちいかわ A賞 ハチワレ BIGぬいぐるみ",
    character: "hachiware",
    channel: "ichiban_kuji",
    series: "kuji_top_prize",
    catalogNumber: "",
    releaseYear: 2023,
    discontinued: true,
    isSpecialEdition: false,
    size: "big",
    authenticity: "likely",
    condition: "near_mint",
    tagCondition: "tag_mint",
    rarity: "A",
    confidence: 0.7,
    reasoningZh:
      "【示範資料】未設定 ANTHROPIC_API_KEY，因此顯示一組範例結果，用來展示辨識與估值的完整流程。實際辨識會先從吊牌判斷出處，再依產品線、角色、尺寸、仿冒疑點與狀態逐項判斷。",
    authenticityFlagsZh: [],
    cautionsZh: [
      "目前為示範模式，這不是真實的辨識結果。",
      "設定 ANTHROPIC_API_KEY 後重新啟動，即可使用真實的 AI 辨識。",
    ],
  };
}
