import { connectDb } from "@/lib/db";
import { Manufacturer } from "@/models";
import { serialize } from "@/lib/api";
import { ImportForm } from "@/components/ImportForm";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await connectDb();
  const manufacturers = await Manufacturer.find({ active: { $ne: false } }).sort({ name: 1 }).lean();
  return (
    <ImportForm
      manufacturers={serialize(manufacturers).map((m) => ({ id: String(m._id), name: m.name }))}
    />
  );
}
