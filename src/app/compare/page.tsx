import { listItems } from "@/lib/store";
import { currencyRates } from "@/lib/plush/channels";
import { CompareClient } from "@/components/CompareClient";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const items = await listItems();
  const initialIds = (ids ?? "").split(",").map((id) => id.trim()).filter(Boolean);

  return <CompareClient items={items} initialIds={initialIds} rates={currencyRates()} />;
}
