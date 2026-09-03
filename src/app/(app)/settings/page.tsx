import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/services/settingsService";
import { serialize } from "@/lib/api";
import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const settings = await getSettings();
  return <SettingsForm settings={serialize(settings.toJSON())} readOnly={session.role !== "admin"} />;
}
