import { currencyRates } from "@/lib/plush/channels";
import { hasApiKey } from "@/lib/ai/identify";
import { requireUser } from "@/lib/session";
import { quotaStatus } from "@/lib/quota";
import { ScanClient } from "@/components/ScanClient";

export const dynamic = "force-dynamic";

export default async function ScanPage() {
  const user = await requireUser();
  const apiKeyConfigured = hasApiKey();
  return (
    <ScanClient
      rates={currencyRates()}
      apiKeyConfigured={apiKeyConfigured}
      // 示範模式不計額度，就不必顯示
      initialQuota={apiKeyConfigured ? await quotaStatus(user) : null}
    />
  );
}
