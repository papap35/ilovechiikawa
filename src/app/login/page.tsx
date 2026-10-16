import { authMode, safeNextPath } from "@/lib/auth";
import { LoginClient } from "@/components/LoginClient";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return <LoginClient mode={authMode()} next={safeNextPath(next)} />;
}
