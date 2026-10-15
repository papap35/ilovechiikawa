import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Identification } from "../plush/schema";
import { normalizeIdentification, RawIdentificationSchema } from "./normalize";
import { IDENTIFY_SYSTEM_PROMPT, IDENTIFY_USER_PROMPT } from "./prompt";
import { mockIdentification } from "./mock";

const MODEL = "claude-opus-5-5";

/**
 * 模型的安全分類器偶爾會誤擋正常請求（stop_reason: "refusal"）。
 * 開啟伺服器端 fallback 後，被擋下的請求會在同一次呼叫內自動改由
 * Anthropic 建議的備援模型重跑，而不是直接把拒絕丟回給使用者。
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export interface InputImage {
  mediaType: ImageMediaType;
  /** base64（不含 data URL 前綴） */
  data: string;
}

export interface IdentifyOptions {
  /**
   * 自訂 Anthropic client。
   * 正式執行時不需要；測試用它攔下送出的請求，驗證請求內容不會被 API 拒絕。
   */
  client?: Anthropic;
}

export interface IdentifyResult {
  identification: Identification;
  /** true 代表沒有設定 API key，回傳的是示範資料 */
  mocked: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
  };
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const SUPPORTED_MEDIA_TYPES: ImageMediaType[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function isSupportedMediaType(value: string): value is ImageMediaType {
  return (SUPPORTED_MEDIA_TYPES as string[]).includes(value);
}

/** 解析 data URL，取出 media type 與 base64 內容。 */
export function parseDataUrl(dataUrl: string): InputImage | null {
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) return null;
  const [, mediaType, data] = match;
  if (!isSupportedMediaType(mediaType)) return null;
  return { mediaType, data };
}

/**
 * 把照片送給 Claude 做辨識。
 *
 * 沒有 API key 時回傳示範資料，讓整個流程在還沒接金鑰前就能跑完，
 * UI 會標示「示範模式」而不是假裝辨識成功。
 */
export async function identifyPlush(
  images: InputImage[],
  options: IdentifyOptions = {},
): Promise<IdentifyResult> {
  if (images.length === 0) {
    throw new Error("至少需要一張照片");
  }

  if (!options.client && !hasApiKey()) {
    return { identification: mockIdentification(), mocked: true };
  }

  const client = options.client ?? new Anthropic();

  const response = await client.beta.messages.parse({
    model: MODEL,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    max_tokens: 16000,
    // 系統提示詞是固定的長文本，快取起來讓每次辨識只付新照片的錢
    system: [
      { type: "text", text: IDENTIFY_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    thinking: { type: "adaptive" },
    output_config: {
      // 這個模型的預設 effort 是 medium；辨識要逐項比對吊牌與做工，明確拉到 high
      effort: "high",
      format: betaZodOutputFormat(RawIdentificationSchema),
    },
    messages: [
      {
        role: "user",
        content: [
          ...images.map((img) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
          })),
          { type: "text" as const, text: IDENTIFY_USER_PROMPT },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("模型拒絕處理這張照片，請換一張再試。");
  }

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("辨識結果無法解析，請再試一次。");
  }

  // 分類欄位對不上時退回保守值，而不是讓整次辨識作廢
  const { identification } = normalizeIdentification(parsed);

  return {
    identification,
    mocked: false,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}
