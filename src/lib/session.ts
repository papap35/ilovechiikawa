import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, userFromSessionCookie, type SessionUser } from "./auth";

/**
 * 頁面（server component）用：取得目前登入的使用者。
 *
 * proxy 已經把沒登入的請求擋在外面，這裡再檢查一次是為了縱深防禦——
 * 萬一哪天 matcher 改錯，頁面也不會拿著 null 去讀某個人的收藏庫。
 */
export async function requireUser(): Promise<SessionUser> {
  const store = await cookies();
  const user = userFromSessionCookie(store.get(SESSION_COOKIE)?.value);
  if (!user) redirect("/login");
  return user;
}
