import { NextResponse } from "next/server";
import { userFromRequest, type SessionUser } from "./auth";

/**
 * Route handler 用：解出目前的使用者，沒登入時直接給出 401 回應。
 *
 * proxy 已經擋過一次，這裡再檢查是縱深防禦，也是決定「讀誰的收藏庫」的唯一來源——
 * userId 一律從簽章過的 session 取得，絕不從網址或 body 讀。
 */
export function authenticate(request: Request): { user: SessionUser } | { response: NextResponse } {
  const user = userFromRequest(request);
  if (!user) return { response: NextResponse.json({ error: "請先登入" }, { status: 401 }) };
  return { user };
}
