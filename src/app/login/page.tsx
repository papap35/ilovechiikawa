import { authMode, safeNextPath } from "@/lib/auth";
import { LoginPanel } from "@/components/LoginPanel";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <LoginPanel
      mode={authMode()}
      next={safeNextPath(next)}
      // 只顯示固定長度內的文字：錯誤訊息來自網址，別讓人塞一大段內容進來
      error={error ? error.slice(0, 120) : null}
    />
  );
}
