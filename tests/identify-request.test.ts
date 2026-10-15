import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { identifyPlush, type InputImage } from "@/lib/ai/identify";
import { SERIES_KEYS } from "@/lib/plush/series";
import { CHANNEL_KEYS } from "@/lib/plush/channels";

/**
 * 驗證實際送給 Claude 的請求內容。
 *
 * 真實呼叫需要金鑰與費用，但「請求會不會被 API 以 400 拒絕」這件事
 * 不需要真的送出去也能驗——攔下 fetch 把 body 拆開檢查就好。
 * 這一層先前完全沒有覆蓋，而一個打錯的模型代號或欄位名稱，
 * 要等到第一次真實呼叫才會炸。
 */

interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

/** 建立一個會攔下請求、回傳假回應的 client。 */
function captureClient(): { client: Anthropic; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];

  const fakeResponse = {
    id: "msg_fake",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1234, output_tokens: 567, cache_read_input_tokens: 890 },
    content: [
      {
        type: "text",
        text: JSON.stringify({
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
          condition: "mint",
          tagCondition: "sealed",
          rarity: "A",
          confidence: 0.82,
          reasoningZh: "吊牌左上有一番くじ標誌，印著 A賞。",
          authenticityFlagsZh: [],
          cautionsZh: ["請拍吊牌背面確認賞別"],
        }),
      },
    ],
  };

  const client = new Anthropic({
    apiKey: "sk-ant-test",
    fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
      captured.push({
        url: String(url),
        body: JSON.parse(String(init?.body ?? "{}")),
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
      });
      return new Response(JSON.stringify(fakeResponse), {
        status: 200,
        headers: { "Content-Type": "application/json", "request-id": "req_fake" },
      });
    },
  });

  return { client, captured };
}

const image: InputImage = { mediaType: "image/jpeg", data: "QUJDRA==" };

async function requestFor(images: InputImage[] = [image]) {
  const { client, captured } = captureClient();
  const result = await identifyPlush(images, { client });
  return { request: captured[0], result, callCount: captured.length };
}

describe("送給 Claude 的請求", () => {
  it("打到 Messages API", async () => {
    const { request } = await requestFor();
    expect(request.url).toContain("/v1/messages");
  });

  it("使用目前的模型代號，且沒有加上日期後綴", async () => {
    const { request } = await requestFor();
    expect(request.body.model).toBe("claude-opus-5-5");
    expect(String(request.body.model)).not.toMatch(/-\d{8}$/);
  });

  it("圖片以 base64 image block 送出，並排在文字指令之前", async () => {
    const { request } = await requestFor();
    const messages = request.body.messages as { role: string; content: unknown[] }[];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");

    const blocks = messages[0].content as Record<string, unknown>[];
    expect(blocks[0]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "QUJDRA==" },
    });
    // 文字指令放最後，讓模型先看到圖再看到要求
    expect(blocks.at(-1)).toMatchObject({ type: "text" });
  });

  it("多張照片全部送出，順序保持不變", async () => {
    const images: InputImage[] = [
      { mediaType: "image/png", data: "AAA=" },
      { mediaType: "image/webp", data: "BBB=" },
      { mediaType: "image/jpeg", data: "CCC=" },
    ];
    const { request } = await requestFor(images);
    const blocks = (request.body.messages as { content: Record<string, unknown>[] }[])[0].content;

    const imageBlocks = blocks.filter((b) => b.type === "image");
    expect(imageBlocks).toHaveLength(3);
    expect(imageBlocks.map((b) => (b.source as { data: string }).data)).toEqual(["AAA=", "BBB=", "CCC="]);
  });

  it("系統提示詞標記為可快取，才不會每次辨識都重付整段的錢", async () => {
    const { request } = await requestFor();
    const system = request.body.system as Record<string, unknown>[];
    expect(Array.isArray(system)).toBe(true);
    expect(system[0]).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
    expect(String(system[0].text).length).toBeGreaterThan(1000);
  });

  it("系統提示詞包含通路與角色目錄，模型才知道可以選哪些代號", async () => {
    const { request } = await requestFor();
    const text = String((request.body.system as { text: string }[])[0].text);
    expect(text).toContain("ichiban_kuji");
    expect(text).toContain("kuji_top_prize");
    expect(text).toContain("ラストワン賞");
    expect(text).toContain("hachiware");
  });

  it("使用 adaptive thinking，沒有送已被移除的 budget_tokens", async () => {
    const { request } = await requestFor();
    expect(request.body.thinking).toMatchObject({ type: "adaptive" });
    expect(JSON.stringify(request.body)).not.toContain("budget_tokens");
  });

  it("明確把 effort 設為 high，不依賴這個模型偏低的預設值", async () => {
    const { request } = await requestFor();
    expect((request.body.output_config as { effort?: string }).effort).toBe("high");
  });

  it("開啟伺服器端 fallback，被安全分類器誤擋時自動改由備援模型重跑", async () => {
    const { request } = await requestFor();
    expect(request.body.fallbacks).toBe("default");
    expect(request.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
  });

  it("結構化輸出設在 output_config.format，不是已棄用的 output_format", async () => {
    const { request } = await requestFor();
    const outputConfig = request.body.output_config as Record<string, unknown>;
    expect(outputConfig).toBeDefined();
    expect(outputConfig.format).toBeDefined();
    expect(request.body.output_format).toBeUndefined();
  });

  it("output schema 把所有合法的品牌與產品線代號寫進欄位描述", async () => {
    const { request } = await requestFor();
    const format = (request.body.output_config as { format: { schema: { properties: Record<string, { description?: string }> } } }).format;
    const props = format.schema.properties;

    // SDK 會把 enum 降級成 string，可選值只寫在描述裡，所以這裡必須有
    expect(props.channel.description).toContain("ichiban_kuji");
    expect(props.character.description).toContain("usagi");
    expect(props.rarity.description).toContain("S");
    for (const key of ["name", "series", "rarity", "authenticity", "authenticityFlagsZh", "confidence", "cautionsZh"]) {
      expect(props[key]).toBeDefined();
    }
  });

  it("max_tokens 留得夠寬，不會把結果截斷", async () => {
    const { request } = await requestFor();
    expect(request.body.max_tokens).toBeGreaterThanOrEqual(4096);
  });

  it("只發一次請求，沒有意外的重試或多輪", async () => {
    const { callCount } = await requestFor();
    expect(callCount).toBe(1);
  });
});

describe("回應的處理", () => {
  it("正常回應會被解析、正規化並回報用量", async () => {
    const { result } = await requestFor();

    expect(result.mocked).toBe(false);
    expect(result.identification.name).toBe("小八 一番賞 A賞 大型玩偶");
    expect(result.identification.channel).toBe("ichiban_kuji");
    expect(result.identification.character).toBe("hachiware");
    expect(SERIES_KEYS).toContain(result.identification.series);
    expect(CHANNEL_KEYS).toContain(result.identification.channel);

    expect(result.usage).toEqual({
      inputTokens: 1234,
      outputTokens: 567,
      cacheReadInputTokens: 890,
    });
  });

  it("有注入 client 時不會因為缺少金鑰而退回示範模式", async () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    const savedToken = process.env.ANTHROPIC_AUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;

    const { result } = await requestFor();
    expect(result.mocked).toBe(false);

    if (saved !== undefined) process.env.ANTHROPIC_API_KEY = saved;
    if (savedToken !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = savedToken;
  });

  it("沒有照片時直接拒絕，不浪費一次 API 呼叫", async () => {
    const { client, captured } = captureClient();
    await expect(identifyPlush([], { client })).rejects.toThrow("至少需要一張照片");
    expect(captured).toHaveLength(0);
  });
});
