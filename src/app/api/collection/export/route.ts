import { listItems } from "@/lib/store";

export const runtime = "nodejs";

/**
 * 匯出整份收藏庫。
 *
 * 部署到雲端之後，這是使用者把自己的資料拿回來的唯一出口——
 * 不能讓收藏被鎖在某個服務商的儲存空間裡。格式就是 store 的原生格式，
 * 所以匯出的檔案可以直接當作本機 data/collection.json 使用。
 */
export async function GET() {
  const items = await listItems();
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(items, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ilovechiikawa-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
