import { notFound } from "next/navigation";
import { getItem } from "@/lib/store";
import { currencyRates } from "@/lib/plush/channels";
import { ItemDetailClient } from "@/components/ItemDetailClient";

export const dynamic = "force-dynamic";

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  return <ItemDetailClient item={item} rates={currencyRates()} />;
}
