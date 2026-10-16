import { listItems, selectDriver } from "@/lib/store";
import { SettingsClient } from "@/components/SettingsClient";
import { authMode } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DRIVER_LABELS: Record<string, string> = {
  "json-file": "本機檔案",
  "vercel-blob": "Vercel Blob",
};

export default async function SettingsPage() {
  const items = await listItems();
  const driver = selectDriver();

  return (
    <SettingsClient
      itemCount={items.length}
      driverName={driver.name}
      driverLabel={DRIVER_LABELS[driver.name] ?? driver.name}
      authMode={authMode()}
    />
  );
}
