import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { RecordManager } from "@/components/RecordManager";
import { MASTER_CONFIGS } from "@/components/masterConfigs";

export const dynamic = "force-dynamic";

export default async function MasterResourcePage({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  const config = MASTER_CONFIGS[resource];
  if (!config) notFound();

  const session = await requireSession();
  const canEdit = config.adminOnly
    ? session.role === "admin"
    : session.role === "admin" || session.role === "estimator";

  return (
    <RecordManager
      title={config.title}
      endpoint={config.endpoint}
      fields={config.fields}
      columns={config.columns}
      canEdit={canEdit}
      emptyMessage={config.emptyMessage}
      intro={config.intro}
    />
  );
}
