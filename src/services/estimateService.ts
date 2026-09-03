import { Types } from "mongoose";
import { connectDb } from "@/lib/db";
import {
  Customer, Equipment, Estimate, EstimateLineItem, LaborRate, Material,
  PGAssembly, PGComponent, Project, RentalRate, SiteFactor, SubcontractorRate, Vendor,
  LOCKED_STATUSES, type EstimateDoc,
} from "@/models";
import type { Unit } from "@/lib/units";
import { ENGINE_VERSION, runEstimatingEngine } from "./estimatingEngine";
import { nextEstimateNumber, revisionNumber } from "./estimateNumberService";
import { explodeAssembly, normalizePlayground, type ComponentRecordLike } from "./playgroundNormalizer";
import { compareVendors, priceRental, type RentalRateLike } from "./rentalPricingService";
import { getSettings, toEngineSettings } from "./settingsService";
import type {
  EngineInput, EngineResult, ExtraLaborInput, ManualLineInput,
  MaterialLineInput, RentalLineInput, SiteRatingInput, SubcontractorLineInput,
} from "./types";

/**
 * The database side of estimating: load everything the engine needs, run it,
 * and persist the result together with a snapshot of every input.
 *
 * The recipe (what the estimator chose) and the snapshot (what those choices
 * cost on the day) are stored separately on purpose. A revision re-runs the
 * recipe against today's rates; an old estimate keeps its snapshot forever.
 */

export interface EstimateRecipe {
  laborRateId?: string | null;
  laborBasis?: "manufacturer" | "components";
  playground: {
    sourceType: "custom" | "preset" | "unknown";
    assemblyId?: string | null;
    assemblyQuantity?: number;
    modelDescription?: string;
    ageRange?: string;
    /** Overrides the assembly's published summary when the quote differs. */
    manufacturerSummary?: {
      laborHours?: number; footingCount?: number; concreteCuFt?: number;
      totalWeightLb?: number; safetyZoneSqFt?: number;
    };
    components: Array<{ componentId: string; quantity: number }>;
    unmatched?: Array<{ partNumber?: string; description?: string; quantity: number }>;
  };
  extraLabor?: ExtraLaborInput[];
  materials?: Array<{ materialId: string; unit?: Unit; quantity: number; laborBucket?: MaterialLineInput["laborBucket"]; note?: string }>;
  concrete?: { readyMixMaterialId?: string | null; baggedMaterialId?: string | null; forceMethod?: "bagged" | "ready_mix" };
  rentals?: Array<{ equipmentId: string; days: number; rentalRateId?: string | null; reason?: string }>;
  ownedEquipment?: Array<{ equipmentId: string; hours?: number; days?: number; note?: string }>;
  subcontractors?: Array<{ subcontractorRateId: string; quantity: number; note?: string }>;
  manualLines?: ManualLineInput[];
  siteRatings?: SiteRatingInput[];
  baseHaulWeightLb?: number;
  pricing?: {
    selectedTier?: "minimum" | "competitive" | "target" | "manual";
    manualPriceCents?: number | null;
    margins?: { minimumPct: number; competitivePct: number; targetPct: number };
  };
  assumptions?: string[];
  exclusions?: string[];
  notes?: string;
}

const oid = (v: string | null | undefined) => (v ? new Types.ObjectId(v) : null);

/** Load every master record the recipe refers to and hand the engine plain objects. */
export async function buildEngineInput(
  projectId: string,
  recipe: EstimateRecipe,
): Promise<{ input: EngineInput; context: { projectName: string; customerName: string } }> {
  await connectDb();

  const settingsDoc = await getSettings();
  const settings = toEngineSettings(settingsDoc);

  const project = await Project.findById(projectId);
  if (!project) throw new Error("Project not found");
  const customer = await Customer.findById(project.customerId);

  // --- Playground -----------------------------------------------------------
  const componentIds = recipe.playground.components.map((c) => new Types.ObjectId(c.componentId));
  let lines: Array<{ component: ComponentRecordLike; quantity: number }> = [];
  let manufacturerSummary = recipe.playground.manufacturerSummary;

  if (recipe.playground.sourceType === "preset" && recipe.playground.assemblyId) {
    const assembly = await PGAssembly.findById(recipe.playground.assemblyId);
    if (assembly) {
      const ids = assembly.components.map((c) => c.componentId);
      const comps = await PGComponent.find({ _id: { $in: ids } });
      const byId = new Map(comps.map((c) => [String(c._id), c]));
      const assemblyLines = assembly.components
        .map((c) => ({ component: byId.get(String(c.componentId)), quantity: c.quantity }))
        .filter((l): l is { component: (typeof comps)[number]; quantity: number } => Boolean(l.component))
        .map((l) => ({ component: toComponentRecord(l.component), quantity: l.quantity }));
      lines = explodeAssembly(assemblyLines, recipe.playground.assemblyQuantity ?? 1);
      manufacturerSummary = manufacturerSummary ?? assembly.manufacturerSummary;
    }
  }

  if (componentIds.length > 0) {
    const comps = await PGComponent.find({ _id: { $in: componentIds } });
    const byId = new Map(comps.map((c) => [String(c._id), c]));
    const picked = recipe.playground.components
      .map((c) => {
        const doc = byId.get(c.componentId);
        return doc ? { component: toComponentRecord(doc), quantity: c.quantity } : null;
      })
      .filter((l): l is { component: ComponentRecordLike; quantity: number } => l !== null);
    lines = [...lines, ...picked];
  }

  const playground = normalizePlayground({
    sourceType: recipe.playground.sourceType,
    modelDescription: recipe.playground.modelDescription,
    ageRange: recipe.playground.ageRange,
    assemblyId: recipe.playground.assemblyId ?? null,
    manufacturerSummary,
    lines,
    unmatched: recipe.playground.unmatched ?? [],
    inference: {
      enabled: settingsDoc.componentLaborInference.enabled,
      defaultHoursPer100Lb: settingsDoc.componentLaborInference.defaultHoursPer100Lb,
      byCategory: settingsDoc.componentLaborInference.byCategory,
    },
  });

  // --- Labor rate -----------------------------------------------------------
  const laborRateDoc = recipe.laborRateId
    ? await LaborRate.findById(recipe.laborRateId)
    : await LaborRate.findOne({ active: true, isDefault: true }) ?? await LaborRate.findOne({ active: true });

  // --- Site factors ---------------------------------------------------------
  const factorDocs = await SiteFactor.find({ active: true }).sort({ sortOrder: 1 });
  const siteRatings = recipe.siteRatings ?? project.site.ratings ?? [];

  // --- Materials ------------------------------------------------------------
  const materialIds = (recipe.materials ?? []).map((m) => new Types.ObjectId(m.materialId));
  const materialDocs = materialIds.length ? await Material.find({ _id: { $in: materialIds } }) : [];
  const materialsById = new Map(materialDocs.map((m) => [String(m._id), m]));

  const materials: MaterialLineInput[] = (recipe.materials ?? []).flatMap((line) => {
    const doc = materialsById.get(line.materialId);
    if (!doc) return [];
    const unit = line.unit ?? doc.defaultUnit;
    const option = doc.pricingOptions.find((o) => o.unit === unit) ?? doc.pricingOptions[0];
    if (!option) return [];
    return [{
      materialId: String(doc._id),
      name: doc.name,
      category: doc.category,
      unit: option.unit,
      quantity: line.quantity,
      unitCostCents: option.unitCostCents,
      fixedFeeCents: option.fixedFeeCents ?? 0,
      minimumChargeCents: option.minimumChargeCents ?? 0,
      wasteFactorPct: doc.wasteFactorPct,
      laborHoursPerUnit: option.laborHoursPerUnit ?? 0,
      laborBucket: line.laborBucket ?? (doc.category.startsWith("surfacing") ? "surfacing" : "other"),
      taxable: doc.taxable,
      note: line.note ?? option.note,
    }];
  });

  // --- Concrete supply ------------------------------------------------------
  const readyMixDoc = recipe.concrete?.readyMixMaterialId
    ? await Material.findById(recipe.concrete.readyMixMaterialId)
    : await Material.findOne({ concreteRole: "ready_mix", active: true });
  const baggedDoc = recipe.concrete?.baggedMaterialId
    ? await Material.findById(recipe.concrete.baggedMaterialId)
    : await Material.findOne({ concreteRole: "bagged", active: true });

  const readyMixOption = readyMixDoc?.pricingOptions.find((o) => o.unit === "cu_yd") ?? readyMixDoc?.pricingOptions[0];
  const baggedOption = baggedDoc?.pricingOptions.find((o) => o.unit === "bag") ?? baggedDoc?.pricingOptions[0];

  // --- Rentals: pick the cheapest vendor unless one was chosen --------------
  const rentals: RentalLineInput[] = [];
  for (const line of recipe.rentals ?? []) {
    const equipment = await Equipment.findById(line.equipmentId);
    if (!equipment) continue;

    const rateDocs = await RentalRate.find({
      equipmentId: equipment._id,
      active: true,
      effectiveDate: { $lte: new Date() },
      $or: [{ expirationDate: null }, { expirationDate: { $gte: new Date() } }],
    });
    const vendorIds = rateDocs.map((r) => r.vendorId).filter(Boolean);
    const vendors = vendorIds.length ? await Vendor.find({ _id: { $in: vendorIds } }) : [];
    const vendorNames = new Map(vendors.map((v) => [String(v._id), v.name]));

    const asRateLike = (r: (typeof rateDocs)[number]): RentalRateLike => ({
      id: String(r._id),
      vendorId: String(r.vendorId),
      vendorName: vendorNames.get(String(r.vendorId)),
      rates: r.rates,
      fees: r.fees,
      fuelIncluded: r.fuelIncluded,
      minimumRental: r.minimumRental,
    });

    const chosenDoc = line.rentalRateId ? rateDocs.find((r) => String(r._id) === line.rentalRateId) : undefined;
    const priced = chosenDoc
      ? [{ rateId: String(chosenDoc._id), vendorId: String(chosenDoc.vendorId), vendorName: vendorNames.get(String(chosenDoc.vendorId)), breakdown: priceRental(asRateLike(chosenDoc), line.days) }]
      : compareVendors(rateDocs.map(asRateLike), line.days);

    const best = priced[0];
    const bestRateDoc = best ? rateDocs.find((r) => String(r._id) === best.rateId) : undefined;

    rentals.push({
      equipmentId: String(equipment._id),
      equipmentName: equipment.name,
      vendorId: best?.vendorId ?? null,
      vendorName: best?.vendorName,
      rentalRateId: best?.rateId ?? null,
      days: line.days,
      breakdown: best?.breakdown ?? priceRental({ rates: {}, fees: {} }, line.days),
      rate: bestRateDoc
        ? { rates: bestRateDoc.rates, fees: bestRateDoc.fees, fuelIncluded: bestRateDoc.fuelIncluded, minimumRental: bestRateDoc.minimumRental }
        : undefined,
      reason: line.reason,
    });
  }

  // --- Owned equipment ------------------------------------------------------
  const ownedIds = (recipe.ownedEquipment ?? []).map((e) => new Types.ObjectId(e.equipmentId));
  const ownedDocs = ownedIds.length ? await Equipment.find({ _id: { $in: ownedIds } }) : [];
  const ownedById = new Map(ownedDocs.map((e) => [String(e._id), e]));
  const ownedEquipment = (recipe.ownedEquipment ?? []).flatMap((line) => {
    const doc = ownedById.get(line.equipmentId);
    if (!doc) return [];
    return [{
      equipmentId: String(doc._id),
      name: doc.name,
      hours: line.hours,
      days: line.days,
      hourlyCents: doc.internalRate?.hourlyCents ?? 0,
      dailyCents: doc.internalRate?.dailyCents ?? 0,
      transportWeightLb: doc.transportWeightLb ?? 0,
      note: line.note,
    }];
  });

  // --- Subcontractors -------------------------------------------------------
  const subIds = (recipe.subcontractors ?? []).map((s) => new Types.ObjectId(s.subcontractorRateId));
  const subDocs = subIds.length ? await SubcontractorRate.find({ _id: { $in: subIds } }) : [];
  const subVendors = subDocs.length ? await Vendor.find({ _id: { $in: subDocs.map((s) => s.vendorId) } }) : [];
  const subVendorNames = new Map(subVendors.map((v) => [String(v._id), v.name]));
  const subById = new Map(subDocs.map((s) => [String(s._id), s]));
  const subcontractors: SubcontractorLineInput[] = (recipe.subcontractors ?? []).flatMap((line) => {
    const doc = subById.get(line.subcontractorRateId);
    if (!doc) return [];
    return [{
      subcontractorRateId: String(doc._id),
      vendorName: subVendorNames.get(String(doc.vendorId)),
      service: doc.service,
      unit: doc.unit,
      quantity: line.quantity,
      unitCostCents: doc.unitCostCents,
      minimumChargeCents: doc.minimumChargeCents,
      mobilizationCents: doc.mobilizationCents,
      markupPct: doc.markupPct,
      note: line.note ?? doc.scopeNotes,
    }];
  });

  const input: EngineInput = {
    settings,
    project: {
      jobType: project.jobType,
      milesFromYard: project.location?.milesFromYard ?? 0,
      customerTaxExempt: customer?.taxExempt ?? false,
      scope: {
        concrete: project.scope.concrete,
        surfacing: project.scope.surfacing,
        excavation: project.scope.excavation,
        demolition: project.scope.demolition,
      },
    },
    siteFactors: factorDocs.map((f) => ({
      key: f.key,
      label: f.label,
      scale: f.scale,
      impacts: f.impacts,
    })),
    siteRatings,
    playground,
    laborRate: {
      laborRateId: laborRateDoc ? String(laborRateDoc._id) : null,
      name: laborRateDoc?.name ?? "No labor rate selected",
      crewSize: laborRateDoc?.crewSize ?? 1,
      fullyBurdenedCents: laborRateDoc?.fullyBurdenedCents ?? 0,
    },
    laborBasis: recipe.laborBasis ?? "manufacturer",
    extraLabor: recipe.extraLabor ?? [],
    materials,
    concreteSupply: {
      readyMix: readyMixDoc && readyMixOption
        ? {
            materialId: String(readyMixDoc._id),
            name: readyMixDoc.name,
            perCuYdCents: readyMixOption.unitCostCents,
            deliveryCents: readyMixOption.fixedFeeCents ?? 0,
            minimumCuYd: readyMixOption.minimumQuantity ?? 0,
          }
        : undefined,
      bagged: baggedDoc && baggedOption
        ? {
            materialId: String(baggedDoc._id),
            name: baggedDoc.name,
            perBagCents: baggedOption.unitCostCents,
            bagWeightLb: baggedDoc.bagWeightLb ?? settingsDoc.concrete.defaultBagWeightLb,
          }
        : undefined,
    },
    rentals,
    ownedEquipment,
    subcontractors,
    manualLines: recipe.manualLines ?? [],
    baseHaulWeightLb: recipe.baseHaulWeightLb ?? 800,
    pricingOverride: recipe.pricing,
  };

  return {
    input,
    context: { projectName: project.name, customerName: customer?.companyName ?? "" },
  };
}

function toComponentRecord(doc: {
  _id: Types.ObjectId; partNumber: string; name: string; category?: string; weightLb?: number;
  installation?: Record<string, unknown>;
  requirements?: { equipment?: Array<Record<string, unknown>>; specialtyTools?: Array<{ name: string }> };
}): ComponentRecordLike {
  const inst = (doc.installation ?? {}) as Record<string, unknown>;
  return {
    id: String(doc._id),
    partNumber: doc.partNumber,
    name: doc.name,
    category: doc.category,
    weightLb: doc.weightLb,
    installation: {
      baseLaborHours: inst.baseLaborHours as number | undefined,
      laborSource: inst.laborSource as string | undefined,
      verified: inst.verified as boolean | undefined,
      footingCount: inst.footingCount as number | undefined,
      concreteCuFt: inst.concreteCuFt as number | undefined,
      complexity: inst.complexity as number | undefined,
    },
    requirements: {
      equipment: (doc.requirements?.equipment ?? []).map((e) => ({
        equipmentId: String(e.equipmentId),
        quantity: e.quantity as number | undefined,
        hours: e.hours as number | undefined,
        days: e.days as number | undefined,
        required: e.required as boolean | undefined,
      })),
      specialtyTools: doc.requirements?.specialtyTools ?? [],
    },
  };
}

/** Run the engine without saving anything -- the live preview on the estimate screen. */
export async function calculateEstimate(projectId: string, recipe: EstimateRecipe): Promise<EngineResult> {
  const { input } = await buildEngineInput(projectId, recipe);
  return runEstimatingEngine(input);
}

export interface SaveEstimateOptions {
  estimateId?: string;
  userId?: string | null;
}

/** Create or update a draft estimate, replacing its line items with fresh ones. */
export async function saveEstimate(
  projectId: string,
  recipe: EstimateRecipe,
  options: SaveEstimateOptions = {},
): Promise<EstimateDoc> {
  await connectDb();
  const settingsDoc = await getSettings();
  const { input } = await buildEngineInput(projectId, recipe);
  const result = runEstimatingEngine(input);

  let estimate = options.estimateId ? await Estimate.findById(options.estimateId) : null;

  if (estimate && LOCKED_STATUSES.includes(estimate.status)) {
    throw new EstimateLockedError(estimate.estimateNumber, estimate.status);
  }

  if (!estimate) {
    const number = await nextEstimateNumber(
      settingsDoc.estimateNumber.prefix,
      settingsDoc.estimateNumber.sequencePadding,
    );
    estimate = new Estimate({
      projectId: new Types.ObjectId(projectId),
      estimateNumber: number,
      version: 1,
      status: "draft",
      createdBy: oid(options.userId),
    });
  }

  applyResultToEstimate(estimate, input, result, recipe, settingsDoc);
  await estimate.save();

  await EstimateLineItem.deleteMany({ estimateId: estimate._id });
  await EstimateLineItem.insertMany(
    result.lineItems.map((li) => ({
      estimateId: estimate!._id,
      category: li.category,
      sortOrder: li.sortOrder,
      description: li.description,
      quantity: li.quantity,
      unit: li.unit,
      unitCostCents: li.unitCostCents,
      costCents: li.costCents,
      manual: li.manual ?? false,
      internalOnly: li.internalOnly ?? false,
      source: {
        type: li.source.type,
        sourceId: li.source.sourceId ? new Types.ObjectId(li.source.sourceId) : null,
        label: li.source.label,
      },
      calculation: li.calculation,
    })),
  );

  return estimate;
}

function applyResultToEstimate(
  estimate: EstimateDoc & { set?: unknown },
  input: EngineInput,
  result: EngineResult,
  recipe: EstimateRecipe,
  settingsDoc: Awaited<ReturnType<typeof getSettings>>,
): void {
  estimate.playgroundSnapshot = {
    sourceType: input.playground.sourceType,
    modelDescription: input.playground.modelDescription,
    ageRange: input.playground.ageRange,
    assemblyId: input.playground.assemblyId ? new Types.ObjectId(input.playground.assemblyId) : null,
    totalWeightLb: input.playground.totals.weightLb,
    footingCount: input.playground.totals.footingCount,
    concreteCuFt: input.playground.totals.concreteCuFt,
    manufacturerLaborHours: input.playground.totals.manufacturerLaborHours,
    safetyZoneSqFt: input.playground.totals.safetyZoneSqFt,
    components: input.playground.components.map((c) => ({
      componentId: c.componentId ? new Types.ObjectId(c.componentId) : null,
      partNumber: c.partNumber,
      name: c.name,
      quantity: c.quantity,
      weightLb: c.weightLb,
      laborHours: c.laborHoursEach,
      laborSource: c.laborSource,
      verified: c.verified,
      footingCount: c.footingCountEach,
      concreteCuFt: c.concreteCuFtEach,
    })),
  };

  estimate.inputSnapshot = {
    calculatedAt: new Date(),
    engineVersion: ENGINE_VERSION,
    laborRate: {
      laborRateId: input.laborRate.laborRateId ? new Types.ObjectId(input.laborRate.laborRateId) : null,
      name: input.laborRate.name,
      crewSize: input.laborRate.crewSize,
      fullyBurdenedCents: input.laborRate.fullyBurdenedCents,
      crewHourlyCents: input.laborRate.fullyBurdenedCents * input.laborRate.crewSize,
    },
    // Frozen: changing these settings later must not restate this estimate.
    settings: JSON.parse(JSON.stringify(input.settings)),
    siteRatings: result.appliedRatings,
    siteMultipliers: result.siteMultipliers,
  };

  estimate.requirements = {
    laborHours: result.requirements.laborHours,
    crewDays: result.requirements.crewDays,
    equipment: result.requirements.equipment.map((e) => ({
      ...e,
      equipmentId: e.equipmentId ? new Types.ObjectId(e.equipmentId) : null,
    })),
    rentals: result.requirements.rentals.map((r) => ({
      ...r,
      equipmentId: r.equipmentId ? new Types.ObjectId(r.equipmentId) : null,
    })),
    specialtyTools: result.requirements.specialtyTools,
  };

  estimate.totals = result.totals;
  estimate.pricing = result.pricing;
  estimate.warnings = result.warnings;
  estimate.recipe = recipe as unknown as Record<string, unknown>;
  estimate.assumptions = [...result.assumptions, ...(recipe.assumptions ?? [])];
  estimate.exclusions = recipe.exclusions ?? estimate.exclusions ?? [];
  estimate.notes = recipe.notes ?? estimate.notes;
  void settingsDoc;
}

export class EstimateLockedError extends Error {
  constructor(number: string, status: string) {
    super(
      `${number} is ${status} and cannot be edited. Create a revision instead -- the customer may be holding ` +
        "a copy of this version, so it has to stay exactly as it was sent.",
    );
    this.name = "EstimateLockedError";
  }
}

/**
 * Fork a locked estimate into the next version. The old one is marked superseded
 * but keeps every number it was sent with.
 */
export async function reviseEstimate(estimateId: string, userId?: string | null): Promise<EstimateDoc> {
  await connectDb();
  const original = await Estimate.findById(estimateId);
  if (!original) throw new Error("Estimate not found");

  const latest = await Estimate.findOne({ projectId: original.projectId }).sort({ version: -1 });
  const nextVersion = (latest?.version ?? original.version) + 1;

  const revision = new Estimate({
    projectId: original.projectId,
    estimateNumber: revisionNumber(original.estimateNumber, nextVersion),
    version: nextVersion,
    status: "draft",
    supersedesId: original._id,
    sourceDocumentIds: original.sourceDocumentIds,
    recipe: original.recipe,
    exclusions: original.exclusions,
    notes: original.notes,
    createdBy: oid(userId),
  });

  const recipe = (original.recipe ?? {}) as unknown as EstimateRecipe;
  const { input } = await buildEngineInput(String(original.projectId), recipe);
  const result = runEstimatingEngine(input);
  applyResultToEstimate(revision, input, result, recipe, await getSettings());
  await revision.save();

  await EstimateLineItem.insertMany(
    result.lineItems.map((li) => ({
      estimateId: revision._id,
      category: li.category, sortOrder: li.sortOrder, description: li.description,
      quantity: li.quantity, unit: li.unit, unitCostCents: li.unitCostCents,
      costCents: li.costCents, manual: li.manual ?? false, internalOnly: li.internalOnly ?? false,
      source: {
        type: li.source.type,
        sourceId: li.source.sourceId ? new Types.ObjectId(li.source.sourceId) : null,
        label: li.source.label,
      },
      calculation: li.calculation,
    })),
  );

  if (original.status !== "accepted") {
    original.status = "superseded";
    await original.save();
  }

  return revision;
}

/** Sending freezes the estimate. Everything after this is a revision. */
export async function markEstimateSent(estimateId: string): Promise<EstimateDoc> {
  await connectDb();
  const estimate = await Estimate.findById(estimateId);
  if (!estimate) throw new Error("Estimate not found");
  if (LOCKED_STATUSES.includes(estimate.status)) {
    throw new EstimateLockedError(estimate.estimateNumber, estimate.status);
  }
  estimate.status = "sent";
  estimate.sentAt = new Date();
  await estimate.save();

  await Project.findByIdAndUpdate(estimate.projectId, { status: "quoted" });
  return estimate;
}
