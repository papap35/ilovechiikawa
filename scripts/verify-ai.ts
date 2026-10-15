/**
 * 用真實的 Claude API 跑一次辨識，確認 AI 這條路真的通。
 *
 *   npm run verify:ai -- 照片1.jpg [照片2.jpg ...]
 *
 * 會印出完整的辨識結果、估值明細與這次呼叫的 token 用量與成本，
 * 讓你在把金鑰放上正式環境之前，先知道它到底準不準、一次要花多少錢。
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  hasApiKey,
  identifyPlush,
  isSupportedMediaType,
  type ImageMediaType,
  type InputImage,
} from "../src/lib/ai/identify";
import { toValuationInput, valuate } from "../src/lib/plush/valuation";
import { getSeries } from "../src/lib/plush/series";
import { getChannel, currencyRates } from "../src/lib/plush/channels";
import { getCharacter } from "../src/lib/plush/characters";
import { AUTHENTICITY, CONDITION, SIZE, TAG_CONDITION } from "../src/lib/plush/grading";

/**
 * 讀取 .env.local。
 *
 * 金鑰只要放在一個地方就好——Next.js 開發時讀的也是這個檔案，
 * 不該讓人為了跑驗證腳本再把金鑰複製到指令列一次。
 */
async function loadEnvLocal(): Promise<void> {
  const file = path.join(process.cwd(), ".env.local");
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return; // 沒有這個檔案很正常，金鑰可能直接在環境變數裡
  }

  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    // 已經在環境變數裡的優先，指令列帶的值不該被檔案蓋掉
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, "");
  }
}

/** Claude Opus 5.5 的費率（美元／百萬 token）。快取讀取是輸入價的 5%。 */
const PRICE_PER_MTOK = { input: 4, output: 20, cacheRead: 0.2 };

const EXT_TO_MEDIA_TYPE: Record<string, ImageMediaType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function loadImage(filePath: string): Promise<InputImage> {
  const ext = path.extname(filePath).toLowerCase();
  const mediaType = EXT_TO_MEDIA_TYPE[ext];
  if (!mediaType || !isSupportedMediaType(mediaType)) {
    throw new Error(`不支援的圖片格式：${ext || filePath}（支援 jpg、png、webp、gif）`);
  }

  const buffer = await fs.readFile(filePath);
  const mb = buffer.byteLength / 1024 / 1024;
  if (mb > 4) {
    console.warn(`⚠ ${path.basename(filePath)} 有 ${mb.toFixed(1)} MB，偏大。`);
    console.warn("  網頁版會先縮到長邊 1280px 再上傳，這個腳本不會，所以成本會比實際使用高。\n");
  }

  return { mediaType, data: buffer.toString("base64") };
}

function money(usd: number): string {
  return usd < 0.01 ? `US$${usd.toFixed(4)}` : `US$${usd.toFixed(3)}`;
}

async function main() {
  await loadEnvLocal();
  const files = process.argv.slice(2);

  if (files.length === 0) {
    console.error("用法：npm run verify:ai -- 照片1.jpg [照片2.jpg ...]");
    console.error("建議一次給三張：正面全身、紙吊牌正反面、布標。");
    process.exit(1);
  }

  if (!hasApiKey()) {
    console.error("✗ 沒有偵測到 ANTHROPIC_API_KEY。\n");
    console.error("  1. 到 https://console.anthropic.com/settings/keys 建立一支金鑰");
    console.error("  2. 寫進專案根目錄的 .env.local（這個腳本與 npm run dev 都會讀）：");
    console.error("       ANTHROPIC_API_KEY=sk-ant-...");
    console.error("  3. 重跑一次這個指令。");
    process.exit(1);
  }

  console.log(`讀取 ${files.length} 張照片…`);
  const images = await Promise.all(files.map(loadImage));

  console.log("送給 Claude 辨識中（第一次會比較久，之後系統提示詞會命中快取）…\n");
  const started = Date.now();
  const result = await identifyPlush(images);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  if (result.mocked) {
    console.error("✗ 回傳的是示範資料，代表金鑰沒有被讀到。");
    process.exit(1);
  }

  const id = result.identification;
  const series = getSeries(id.series);
  const channel = getChannel(series.channel);

  console.log("─".repeat(60));
  console.log("辨識結果");
  console.log("─".repeat(60));
  console.log(`商品　　　${id.name}`);
  if (id.nameOriginal) console.log(`日文原名　${id.nameOriginal}`);
  console.log(`角色　　　${getCharacter(id.character).nameZh}（${id.character}）`);
  console.log(`出處　　　${channel.nameZh}（${id.channel}）`);
  console.log(`產品線　　${series.nameZh}（${id.series}）`);
  console.log(`JAN／編號　${id.catalogNumber || "—"}`);
  console.log(`尺寸　　　${SIZE[id.size].labelZh}`);
  console.log(`稀有度　　${id.rarity}`);
  console.log(`特別版　　${id.isSpecialEdition ? channel.specialVariant?.labelZh ?? "是" : "否"}`);
  console.log(`正版查證　${AUTHENTICITY[id.authenticity].labelZh}`);
  console.log(`本體狀態　${CONDITION[id.condition].labelZh}　／　吊牌　${TAG_CONDITION[id.tagCondition].labelZh}`);
  console.log(`發售年份　${id.releaseYear || "—"}　／　停售　${id.discontinued ? "是" : "否"}`);
  console.log(`信心度　　${Math.round(id.confidence * 100)}%`);
  console.log(`\n判斷依據\n  ${id.reasoningZh}`);
  if (id.authenticityFlagsZh.length) {
    console.log("\n仿冒疑點");
    for (const flag of id.authenticityFlagsZh) console.log(`  · ${flag}`);
  }
  if (id.cautionsZh.length) {
    console.log("\n需要你親自確認");
    for (const caution of id.cautionsZh) console.log(`  · ${caution}`);
  }

  const valuation = valuate(toValuationInput(id), { rates: currencyRates() });

  console.log(`\n${"─".repeat(60)}`);
  console.log("估值");
  console.log("─".repeat(60));
  console.log(`NT$${valuation.midTwd.toLocaleString()}　（區間 NT$${valuation.lowTwd.toLocaleString()} – NT$${valuation.highTwd.toLocaleString()}）`);
  console.log(`產品線基準　NT$${valuation.baseTwd.toLocaleString()}`);
  for (const factor of valuation.factors) {
    console.log(`  ×${factor.multiplier.toFixed(2).padStart(6)}　${factor.labelZh}`);
  }

  const usage = result.usage;
  if (usage) {
    const cost =
      (usage.inputTokens / 1e6) * PRICE_PER_MTOK.input +
      (usage.outputTokens / 1e6) * PRICE_PER_MTOK.output +
      (usage.cacheReadInputTokens / 1e6) * PRICE_PER_MTOK.cacheRead;

    console.log(`\n${"─".repeat(60)}`);
    console.log("用量與成本");
    console.log("─".repeat(60));
    console.log(`耗時　　　${elapsed} 秒`);
    console.log(`輸入　　　${usage.inputTokens.toLocaleString()} tokens`);
    console.log(`快取讀取　${usage.cacheReadInputTokens.toLocaleString()} tokens${usage.cacheReadInputTokens > 0 ? "（系統提示詞命中快取）" : "（未命中，第一次呼叫正常）"}`);
    console.log(`輸出　　　${usage.outputTokens.toLocaleString()} tokens`);
    console.log(`這次約　　${money(cost)}`);
  }

  console.log("\n✓ AI 辨識可用。");
}

main().catch((error) => {
  console.error("\n✗ 辨識失敗：", error instanceof Error ? error.message : error);
  if (error instanceof Error && /authentication|api.?key|401/i.test(error.message)) {
    console.error("  看起來是金鑰問題，確認 ANTHROPIC_API_KEY 正確且帳戶有額度。");
  }
  process.exit(1);
});
