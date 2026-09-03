import { connectDb } from "@/lib/db";
import { Customer, SiteFactor } from "@/models";
import { serialize } from "@/lib/api";
import { ProjectForm } from "@/components/ProjectForm";

export const dynamic = "force-dynamic";

export default async function NewProjectPage() {
  await connectDb();
  const [customers, factors] = await Promise.all([
    Customer.find({ active: { $ne: false } }).sort({ companyName: 1 }).lean(),
    SiteFactor.find({ active: { $ne: false } }).sort({ sortOrder: 1 }).lean(),
  ]);

  return (
    <ProjectForm
      customers={serialize(customers).map((c) => ({
        id: String(c._id),
        companyName: c.companyName,
        jobType: c.jobType,
      }))}
      factors={serialize(factors).map((f) => ({
        key: f.key,
        label: f.label,
        description: f.description,
        scale: f.scale,
        ratingLabels: f.ratingLabels,
        impacts: f.impacts,
      }))}
    />
  );
}
