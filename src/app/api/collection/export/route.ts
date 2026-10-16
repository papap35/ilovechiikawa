import { listItems } from "@/lib/store";
import { authenticate } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * 匯出目前使用者的整份收藏庫。
 *
 * 部署到雲端之後，這是使用者把自己的資料拿回來的唯一出口——
 * 不能讓收藏被鎖在某個服務商的儲存空間裡。格式就是 store 的原生格式，
 * 所以匯出的檔案可以直接當作本機 data/collection.json 使用。
 */
export async function GET(request: Request) {
  const auth = authenticate(request);
  if ("response" in auth) return auth.response;

  const items = await listItems(auth.user.id);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(JSON.stringify(items, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ilovechiikawa-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
