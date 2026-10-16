import { listItems } from "@/lib/store";
import { requireUser } from "@/lib/session";
import { currencyRates } from "@/lib/plush/channels";
import { CompareClient } from "@/components/CompareClient";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const { ids } = await searchParams;
  const user = await requireUser();
  const items = await listItems(user.id);
  const initialIds = (ids ?? "").split(",").map((id) => id.trim()).filter(Boolean);

  return <CompareClient items={items} initialIds={initialIds} rates={currencyRates()} />;
}
