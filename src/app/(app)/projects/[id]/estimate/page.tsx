import { notFound } from "next/navigation";
import { connectDb } from "@/lib/db";
import {
  Equipment, Estimate, LaborRate, Material, PGAssembly, PGComponent,
  Project, SiteFactor, SubcontractorRate, Vendor,
} from "@/models";
import { serialize } from "@/lib/api";
import { EstimateBuilder } from "@/components/EstimateBuilder";

export const dynamic = "force-dynamic";

/**
 * The estimating screen. Master data is loaded here on the server and handed to
 * the builder; the builder then asks /api/estimates/calculate to price whatever
 * the estimator has assembled, so the number moves as they work.
 */
export default async function EstimatePage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ estimateId?: string }>;
}) {
  const { id } = await params;
  const { estimateId } = await searchParams;
  await connectDb();

  const project = await Project.findById(id).lean().catch(() => null);
  if (!project) notFound();

  const [factors, laborRates, assemblies, materials, equipment, subRates, components, vendors, existing] =
    await Promise.all([
      SiteFactor.find({ active: { $ne: false } }).sort({ sortOrder: 1 }).lean(),
      LaborRate.find({ active: { $ne: false } }).sort({ name: 1 }).lean(),
      PGAssembly.find({ active: { $ne: false } }).sort({ modelNumber: 1 }).lean(),
      Material.find({ active: { $ne: false } }).sort({ name: 1 }).lean(),
      Equipment.find({ active: { $ne: false } }).sort({ name: 1 }).lean(),
      SubcontractorRate.find({ active: { $ne: false } }).sort({ service: 1 }).lean(),
      PGComponent.find({ active: { $ne: false } }).sort({ partNumber: 1 }).limit(500).lean(),
      Vendor.find({ active: { $ne: false } }).lean(),
      estimateId ? Estimate.findById(estimateId).lean() : Promise.resolve(null),
    ]);

  const vendorNames = new Map(vendors.map((v) => [String(v._id), v.name]));

  return (
    <EstimateBuilder
      project={serialize({
        id: String(project._id),
        name: project.name,
        jobType: project.jobType,
        milesFromYard: project.location?.milesFromYard ?? 0,
        scope: project.scope,
        siteRatings: project.site?.ratings ?? [],
      })}
      existingEstimate={
        existing
          ? serialize({
              id: String(existing._id),
              estimateNumber: existing.estimateNumber,
              status: existing.status,
              recipe: existing.recipe,
            })
          : null
      }
      factors={serialize(factors).map((f) => ({
        key: f.key, label: f.label, description: f.description,
        scale: f.scale, ratingLabels: f.ratingLabels, impacts: f.impacts,
      }))}
      laborRates={serialize(laborRates).map((r) => ({
        id: String(r._id), name: r.name, crewSize: r.crewSize,
        fullyBurdenedCents: r.fullyBurdenedCents, isDefault: r.isDefault,
      }))}
      assemblies={serialize(assemblies).map((a) => ({
        id: String(a._id), modelNumber: a.modelNumber, name: a.name,
        ageRange: a.ageRange, summary: a.manufacturerSummary,
        componentCount: a.components.length,
      }))}
      components={serialize(components).map((c) => ({
        id: String(c._id), partNumber: c.partNumber, name: c.name,
        category: c.category, weightLb: c.weightLb,
        baseLaborHours: c.installation?.baseLaborHours ?? null,
        verified: c.installation?.verified ?? false,
      }))}
      materials={serialize(materials).map((m) => ({
        id: String(m._id), name: m.name, category: m.category,
        defaultUnit: m.defaultUnit, concreteRole: m.concreteRole ?? null,
        pricingOptions: m.pricingOptions.map((o) => ({
          unit: o.unit, unitCostCents: o.unitCostCents, laborHoursPerUnit: o.laborHoursPerUnit ?? 0,
        })),
      }))}
      equipment={serialize(equipment).map((e) => ({
        id: String(e._id), name: e.name, type: e.type, ownership: e.ownership,
        hourlyCents: e.internalRate?.hourlyCents ?? 0,
        dailyCents: e.internalRate?.dailyCents ?? 0,
      }))}
      subcontractorRates={serialize(subRates).map((s) => ({
        id: String(s._id), service: s.service, unit: s.unit,
        unitCostCents: s.unitCostCents, vendorName: vendorNames.get(String(s.vendorId)) ?? "",
      }))}
    />
  );
}
