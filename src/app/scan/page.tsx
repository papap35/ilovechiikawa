import { currencyRates } from "@/lib/plush/channels";
import { hasApiKey } from "@/lib/ai/identify";
import { ScanClient } from "@/components/ScanClient";

export const dynamic = "force-dynamic";

export default function ScanPage() {
  return <ScanClient rates={currencyRates()} apiKeyConfigured={hasApiKey()} />;
}
