import { percentOf, round, sumCents } from "@/lib/money";
import { calculateConcrete } from "./concreteService";
import { calculateMobilization } from "./mobilizationService";
import { calculatePricing } from "./pricingService";
import { priceRental } from "./rentalPricingService";
import { computeSiteMultipliers, explainMultiplier } from "./siteFactorService";
import type {
  DraftLineItem, EngineInput, EngineResult, EngineWarning,
} from "./types";

/**
 * The estimating engine.
 *
 * Costs are built in layers rather than one formula, so that a number that
 * looks wrong can be traced to the layer that produced it:
 *
 *   1. normalize the playground        (playgroundNormalizer)
 *   2. work out what the job needs     (hours, concrete, equipment, materials)
 *   3. cost it directly                (labor, material, rental, equipment, mob)
 *   4. add contingency and overhead
 *   5. turn cost into price at a gross margin
 *
 * Every line it emits carries the inputs and the formula that produced it, so
 * the estimate can explain itself line by line.
 *
 * A note on hours: all labor here is MAN-hours, not crew-hours. Manufacturer
 * install figures are published that way, and it keeps the labor rate a simple
 * per-person cost. Crew size is used only to work out how many days the job
 * takes and how many bodies travel.
 */

export const ENGINE_VERSION = "1.0.0";

/** Bump the version whenever a change alters what the same inputs would produce. */

export function runEstimatingEngine(input: EngineInput): EngineResult {
  const { settings, project, playground, laborRate } = input;
  const warnings: EngineWarning[] = [];
  const assumptions: string[] = [];
  const lineItems: DraftLineItem[] = [];

  // ---------------------------------------------------------------- layer 1/2
  const site = computeSiteMultipliers(input.siteFactors, input.siteRatings);
  const m = site.multipliers;

  // --- Labor: the structure itself -----------------------------------------
  let componentHours = playground.totals.componentLaborHours;
  let laborBasisNote: string;

  if (input.laborBasis === "manufacturer") {
    if (playground.totals.manufacturerLaborHours > 0) {
      componentHours = round(
        playground.totals.manufacturerLaborHours * settings.labor.manufacturerHoursMultiplier,
        2,
      );
      laborBasisNote =
        `Manufacturer published ${playground.totals.manufacturerLaborHours} hr x ` +
        `${settings.labor.manufacturerHoursMultiplier} Build Play factor`;
    } else {
      laborBasisNote = "Rolled up from component library (no manufacturer hours published)";
      warnings.push({
        level: "warning",
        message:
          "Manufacturer hours were selected as the labor basis but none are on file for this structure. " +
          "Fell back to the component library roll-up.",
        ref: "labor.basis",
      });
    }
  } else {
    laborBasisNote = "Rolled up from component library";
  }

  const inferredCount = playground.components.filter(
    (c) => c.laborSource === "inferred_weight" && c.quantity > 0,
  ).length;
  if (inferredCount > 0 && input.laborBasis !== "manufacturer") {
    warnings.push({
      level: "warning",
      message:
        `${inferredCount} component${inferredCount === 1 ? "" : "s"} used install hours inferred from weight ` +
        "rather than measured hours. Treat this labor number as provisional until those parts have been installed.",
      ref: "labor.inferred",
    });
  }
  if (playground.unmatched.length > 0) {
    warnings.push({
      level: "error",
      message:
        `${playground.unmatched.length} line${playground.unmatched.length === 1 ? "" : "s"} from the manufacturer ` +
        "quote could not be matched to the component library and carry no labor, weight or concrete.",
      ref: "playground.unmatched",
    });
  }

  // --- Concrete -------------------------------------------------------------
  const concrete = project.scope.concrete
    ? calculateConcrete(playground.totals.concreteCuFt, settings, input.concreteSupply)
    : calculateConcrete(0, settings, input.concreteSupply);

  if (project.scope.concrete && concrete.method === "none" && playground.totals.concreteCuFt > 0) {
    warnings.push({
      level: "error",
      message: "Concrete is in scope but no concrete price is on file, so it is missing from this estimate.",
      ref: "concrete.price",
    });
  }

  // --- Labor from materials that carry their own install time ---------------
  const materialLaborByBucket: Record<string, number> = {
    surfacing: 0, concrete: 0, excavation: 0, demolition: 0, other: 0,
  };
  for (const mat of input.materials) {
    if (!mat.laborHoursPerUnit) continue;
    const bucket = mat.laborBucket ?? "other";
    materialLaborByBucket[bucket] += mat.laborHoursPerUnit * mat.quantity;
  }

  // --- Labor entered by hand ------------------------------------------------
  const extraByBucket: Record<string, number> = {
    surfacing: 0, concrete: 0, excavation: 0, demolition: 0, other: 0,
  };
  for (const extra of input.extraLabor) extraByBucket[extra.bucket] += extra.hours;

  const rawHours = {
    componentInstall: round(componentHours, 2),
    concrete: round(concrete.laborHours + materialLaborByBucket.concrete + extraByBucket.concrete, 2),
    surfacing: round(materialLaborByBucket.surfacing + extraByBucket.surfacing, 2),
    excavation: round(materialLaborByBucket.excavation + extraByBucket.excavation, 2),
    demolition: round(materialLaborByBucket.demolition + extraByBucket.demolition, 2),
    other: round(materialLaborByBucket.other + extraByBucket.other, 2),
  };

  // Each bucket is stretched by the site factors that actually touch it.
  const adjustedHours = {
    componentInstall: round(rawHours.componentInstall * m.install_labor, 2),
    concrete: round(rawHours.concrete * m.concrete_labor, 2),
    surfacing: round(rawHours.surfacing * m.surfacing_labor, 2),
    excavation: round(rawHours.excavation * m.excavation_labor, 2),
    demolition: round(rawHours.demolition * m.demolition_labor, 2),
    other: round(rawHours.other, 2),
  };

  const totalRawHours = round(Object.values(rawHours).reduce((a, b) => a + b, 0), 2);
  const totalAdjustedHours = round(Object.values(adjustedHours).reduce((a, b) => a + b, 0), 2);

  // ---------------------------------------------------------------- layer 3
  const rate = laborRate.fullyBurdenedCents;
  if (!rate) {
    warnings.push({
      level: "error",
      message: "No labor rate is set, so all labor on this estimate costs nothing. Pick a crew or rate first.",
      ref: "labor.rate",
    });
  }

  const laborBuckets: Array<[keyof typeof adjustedHours, string, number, string]> = [
    ["componentInstall", "Playground installation labor", m.install_labor, "install_labor"],
    ["concrete", "Concrete labor (footings, mixing, placing)", m.concrete_labor, "concrete_labor"],
    ["surfacing", "Surfacing labor", m.surfacing_labor, "surfacing_labor"],
    ["excavation", "Excavation labor", m.excavation_labor, "excavation_labor"],
    ["demolition", "Demolition labor", m.demolition_labor, "demolition_labor"],
    ["other", "Other labor", 1, "install_labor"],
  ];

  let laborCostCents = 0;
  let sort = 0;
  for (const [bucket, label, multiplier, target] of laborBuckets) {
    const hours = adjustedHours[bucket];
    if (hours <= 0) continue;
    const cost = Math.round(hours * rate);
    laborCostCents += cost;
    lineItems.push({
      category: "labor",
      sortOrder: (sort += 10),
      description: label,
      quantity: hours,
      unit: "hour",
      unitCostCents: rate,
      costCents: cost,
      source: { type: "laborRate", sourceId: laborRate.laborRateId ?? null, label: laborRate.name },
      calculation: {
        inputs: {
          rawHours: rawHours[bucket],
          siteMultiplier: multiplier,
          adjustedHours: hours,
          fullyBurdenedRatePerHour: rate / 100,
          basis: bucket === "componentInstall" ? laborBasisNote : undefined,
        },
        formula: "adjustedHours x fullyBurdenedRate",
        explanation:
          `${rawHours[bucket]} man-hours` +
          (multiplier !== 1 ? ` x ${multiplier} site factor = ${hours} hr` : "") +
          `, at ${(rate / 100).toFixed(2)}/hr fully burdened (${laborRate.name})` +
          (multiplier !== 1 ? `. ${explainMultiplier(target as never, site.applied)}` : "") +
          (bucket === "componentInstall" ? `. Basis: ${laborBasisNote}.` : ""),
      },
    });
  }

  const crewDays =
    laborRate.crewSize > 0 && settings.labor.productiveHoursPerCrewDay > 0
      ? round(totalAdjustedHours / (laborRate.crewSize * settings.labor.productiveHoursPerCrewDay), 2)
      : 0;

  // --- Materials ------------------------------------------------------------
  let materialCostCents = 0;
  let taxableMaterialCents = 0;
  sort = 0;

  if (concrete.method !== "none" && concrete.totalMaterialCents > 0) {
    materialCostCents += concrete.totalMaterialCents;
    taxableMaterialCents += concrete.totalMaterialCents;
    const isBagged = concrete.method === "bagged";
    lineItems.push({
      category: "concrete",
      sortOrder: (sort += 10),
      description: `${concrete.materialName} (${isBagged ? "hand-mixed on site" : "ready-mix delivered"})`,
      quantity: isBagged ? concrete.bagCount : concrete.orderedCuYd,
      unit: isBagged ? "bag" : "cu_yd",
      unitCostCents: isBagged
        ? Math.round(concrete.materialCents / Math.max(concrete.bagCount, 1))
        : Math.round(concrete.materialCents / Math.max(concrete.orderedCuYd, 0.001)),
      costCents: concrete.totalMaterialCents,
      source: { type: "material", sourceId: concrete.materialId ?? null, label: concrete.materialName },
      calculation: {
        inputs: {
          footingConcreteCuFt: concrete.rawCuFt,
          wasteFactorPct: concrete.wasteFactorPct,
          orderedCuFt: concrete.orderedCuFt,
          orderedCuYd: concrete.orderedCuYd,
          method: concrete.method,
          deliveryCents: concrete.deliveryCents,
        },
        formula: isBagged
          ? "ceil((cuFt x (1 + waste)) / bagYieldCuFt) x pricePerBag"
          : "(cuFt x (1 + waste)) / 27 x pricePerCuYd + delivery",
        explanation: concrete.explanation,
      },
    });
    assumptions.push(concrete.explanation);
  }

  for (const mat of input.materials) {
    const siteQtyMultiplier = mat.applySiteFactors === false ? 1 : m.material_quantity;
    const waste = mat.wasteFactorPct ?? 0;
    const orderedQty = round(mat.quantity * siteQtyMultiplier * (1 + waste / 100), 3);
    const rawCost = Math.round(orderedQty * mat.unitCostCents) + (mat.fixedFeeCents ?? 0);
    const cost = Math.max(rawCost, mat.minimumChargeCents ?? 0);
    if (cost <= 0) continue;

    materialCostCents += cost;
    if (mat.taxable !== false) taxableMaterialCents += cost;

    const isSurfacing = mat.category.startsWith("surfacing");
    const minNote = cost > rawCost ? ` Raised to the ${(cost / 100).toFixed(2)} minimum charge.` : "";
    const wasteNote = waste ? ` including ${waste}% waste` : "";
    const siteNote = siteQtyMultiplier !== 1 ? ` x ${siteQtyMultiplier} site factor` : "";

    lineItems.push({
      category: isSurfacing ? "surfacing" : "material",
      sortOrder: (sort += 10),
      description: mat.name,
      quantity: orderedQty,
      unit: mat.unit,
      unitCostCents: mat.unitCostCents,
      costCents: cost,
      source: { type: "material", sourceId: mat.materialId ?? null, label: mat.name },
      calculation: {
        inputs: {
          requestedQuantity: mat.quantity,
          siteMultiplier: siteQtyMultiplier,
          wasteFactorPct: waste,
          orderedQuantity: orderedQty,
          unitCost: mat.unitCostCents / 100,
          fixedFee: (mat.fixedFeeCents ?? 0) / 100,
        },
        formula: "quantity x siteMultiplier x (1 + waste) x unitCost + fixedFee",
        explanation:
          `${mat.quantity} ${mat.unit}${siteNote}${wasteNote} = ${orderedQty} ${mat.unit} ` +
          `at ${(mat.unitCostCents / 100).toFixed(2)}/${mat.unit}.${minNote}` +
          (mat.note ? ` ${mat.note}` : ""),
      },
    });
  }

  // --- Rentals --------------------------------------------------------------
  let rentalCostCents = 0;
  let taxableRentalCents = 0;
  sort = 0;
  const rentalRequirements: EngineResult["requirements"]["rentals"] = [];

  for (const rental of input.rentals) {
    // A hard site can keep a machine on the job longer than planned.
    const stretchedDays = m.rental_days !== 1 ? Math.ceil(rental.days * m.rental_days) : rental.days;
    const breakdown =
      rental.rate && stretchedDays !== rental.days
        ? priceRental(rental.rate, stretchedDays, { fuelCostCents: rental.fuelCostCents })
        : rental.breakdown;

    if (breakdown.totalCents <= 0) {
      warnings.push({
        level: "warning",
        message: `No rental rate on file for ${rental.equipmentName}; it is on the estimate at zero cost.`,
        ref: "rental.rate",
      });
    }

    rentalCostCents += breakdown.totalCents;
    if (rental.taxable !== false) taxableRentalCents += breakdown.totalCents;

    rentalRequirements.push({
      equipmentId: rental.equipmentId ?? null,
      name: rental.equipmentName,
      days: stretchedDays,
      vendorName: rental.vendorName,
      reason: rental.reason,
    });

    lineItems.push({
      category: "rental",
      sortOrder: (sort += 10),
      description: `${rental.equipmentName} rental${rental.vendorName ? ` (${rental.vendorName})` : ""}`,
      quantity: stretchedDays,
      unit: "day",
      unitCostCents: stretchedDays > 0 ? Math.round(breakdown.totalCents / stretchedDays) : 0,
      costCents: breakdown.totalCents,
      source: { type: "rentalRate", sourceId: rental.rentalRateId ?? null, label: rental.vendorName },
      calculation: {
        inputs: {
          requestedDays: rental.days,
          siteMultiplier: m.rental_days,
          billedDays: stretchedDays,
          rental: breakdown.rentalCents / 100,
          delivery: breakdown.deliveryCents / 100,
          pickup: breakdown.pickupCents / 100,
          cleaning: breakdown.cleaningCents / 100,
          environmental: breakdown.environmentalCents / 100,
          damageWaiver: breakdown.damageWaiverCents / 100,
          fuel: breakdown.fuelCents / 100,
          other: breakdown.otherCents / 100,
        },
        formula: "rental + delivery + pickup + cleaning + environmental + damage waiver + fuel + other",
        explanation:
          `${breakdown.explanation} Rental ${(breakdown.rentalCents / 100).toFixed(2)}` +
          `, delivery ${(breakdown.deliveryCents / 100).toFixed(2)}` +
          `, pickup ${(breakdown.pickupCents / 100).toFixed(2)}` +
          (breakdown.fuelCents ? `, fuel ${(breakdown.fuelCents / 100).toFixed(2)}` : "") +
          (breakdown.environmentalCents ? `, environmental ${(breakdown.environmentalCents / 100).toFixed(2)}` : "") +
          (breakdown.damageWaiverCents ? `, damage waiver ${(breakdown.damageWaiverCents / 100).toFixed(2)}` : "") +
          (rental.reason ? `. Required because: ${rental.reason}` : ""),
      },
    });
  }

  // --- Owned equipment ------------------------------------------------------
  let equipmentCostCents = 0;
  let haulWeightLb = input.baseHaulWeightLb ?? 0;
  sort = 0;
  const equipmentRequirements: EngineResult["requirements"]["equipment"] = [];

  for (const eq of input.ownedEquipment) {
    const byDay = (eq.days ?? 0) > 0 && (eq.dailyCents ?? 0) > 0;
    const base = byDay
      ? Math.round((eq.days ?? 0) * (eq.dailyCents ?? 0))
      : Math.round((eq.hours ?? 0) * (eq.hourlyCents ?? 0));
    const cost = Math.round((base + (eq.fuelCostCents ?? 0)) * m.equipment_cost);
    haulWeightLb += eq.transportWeightLb ?? 0;
    if (cost <= 0) continue;

    equipmentCostCents += cost;
    equipmentRequirements.push({
      equipmentId: eq.equipmentId ?? null,
      name: eq.name,
      hours: eq.hours,
      days: eq.days,
      owned: true,
      reason: eq.note,
    });

    lineItems.push({
      category: "equipment",
      sortOrder: (sort += 10),
      description: `${eq.name} (Build Play owned)`,
      quantity: byDay ? (eq.days ?? 0) : (eq.hours ?? 0),
      unit: byDay ? "day" : "hour",
      unitCostCents: byDay ? (eq.dailyCents ?? 0) : (eq.hourlyCents ?? 0),
      costCents: cost,
      source: { type: "equipment", sourceId: eq.equipmentId ?? null, label: eq.name },
      calculation: {
        inputs: {
          hours: eq.hours, days: eq.days,
          internalRate: (byDay ? eq.dailyCents : eq.hourlyCents) ?? 0,
          fuel: (eq.fuelCostCents ?? 0) / 100,
          siteMultiplier: m.equipment_cost,
        },
        formula: "(usage x internalRate + fuel) x siteMultiplier",
        explanation:
          `Owned equipment charged to the job at its internal rate so it is not treated as free. ` +
          `${byDay ? `${eq.days} day(s)` : `${eq.hours} hr`} at ` +
          `${(((byDay ? eq.dailyCents : eq.hourlyCents) ?? 0) / 100).toFixed(2)}` +
          (eq.fuelCostCents ? ` plus ${(eq.fuelCostCents / 100).toFixed(2)} fuel` : "") +
          (m.equipment_cost !== 1 ? `, x ${m.equipment_cost} site factor` : "") + ".",
      },
    });
  }

  // --- Subcontractors -------------------------------------------------------
  let subcontractorCostCents = 0;
  sort = 0;
  for (const sub of input.subcontractors) {
    const base = Math.max(
      Math.round(sub.quantity * sub.unitCostCents),
      sub.minimumChargeCents ?? 0,
    ) + (sub.mobilizationCents ?? 0);
    const markup = percentOf(base, sub.markupPct ?? 0);
    const cost = base + markup;
    if (cost <= 0) continue;

    subcontractorCostCents += cost;
    lineItems.push({
      category: "subcontractor",
      sortOrder: (sort += 10),
      description: `${sub.service}${sub.vendorName ? ` (${sub.vendorName})` : ""}`,
      quantity: sub.quantity,
      unit: sub.unit,
      unitCostCents: sub.unitCostCents,
      costCents: cost,
      source: { type: "subcontractorRate", sourceId: sub.subcontractorRateId ?? null, label: sub.vendorName },
      calculation: {
        inputs: {
          quantity: sub.quantity,
          unitCost: sub.unitCostCents / 100,
          minimumCharge: (sub.minimumChargeCents ?? 0) / 100,
          subMobilization: (sub.mobilizationCents ?? 0) / 100,
          markupPct: sub.markupPct ?? 0,
        },
        formula: "max(quantity x unitCost, minimum) + subMobilization + markup",
        explanation:
          `${sub.quantity} ${sub.unit} at ${(sub.unitCostCents / 100).toFixed(2)}/${sub.unit}` +
          ((sub.markupPct ?? 0) > 0 ? `, plus ${sub.markupPct}% markup` : "") +
          `. The job's gross margin is applied on top of this cost like any other.` +
          (sub.note ? ` ${sub.note}` : ""),
      },
    });
  }

  // --- Consumables ----------------------------------------------------------
  let consumablesCostCents = 0;
  if (settings.consumables.enabled && laborCostCents > 0) {
    consumablesCostCents = percentOf(laborCostCents, settings.consumables.percentOfLaborCost);
    lineItems.push({
      category: "consumables",
      sortOrder: 10,
      description: "Consumables (blades, bits, fasteners, marking paint, blocking)",
      quantity: 1,
      unit: "lump_sum",
      unitCostCents: consumablesCostCents,
      costCents: consumablesCostCents,
      internalOnly: true,
      source: { type: "setting", label: "Consumables allowance" },
      calculation: {
        inputs: { laborCost: laborCostCents / 100, percentOfLabor: settings.consumables.percentOfLaborCost },
        formula: "laborCost x consumablesPercent",
        explanation:
          `Small materials nobody itemises, charged at ${settings.consumables.percentOfLaborCost}% of labor cost ` +
          "because consumable burn tracks crew-hours rather than job size.",
      },
    });
  }

  // --- Mobilization ---------------------------------------------------------
  const mobilization = calculateMobilization(
    {
      milesFromYard: project.milesFromYard,
      haulWeightLb,
      crewSize: laborRate.crewSize,
      fullyBurdenedCents: rate,
      siteMultiplier: m.mobilization,
    },
    settings,
  );
  const mobilizationCostCents = mobilization.totalCents;
  lineItems.push({
    category: "mobilization",
    sortOrder: 10,
    description: "Mobilization (travel, hauling, load and unload)",
    quantity: 1,
    unit: "lump_sum",
    unitCostCents: mobilizationCostCents,
    costCents: mobilizationCostCents,
    source: { type: "setting", label: "Mobilization" },
    calculation: {
      inputs: {
        oneWayMiles: mobilization.oneWayMiles,
        trips: mobilization.trips,
        totalMiles: mobilization.totalMiles,
        haulWeightLb: mobilization.haulWeightLb,
        distance: mobilization.distanceCents / 100,
        weight: mobilization.weightCents / 100,
        crewTravel: mobilization.crewTravelCents / 100,
        minimumCharge: mobilization.minimumChargeCents / 100,
      },
      formula: "max(minimum, (miles x perMile + weightSurcharge + crewTravelHours x crew x rate) x siteMultiplier)",
      explanation: mobilization.explanation,
    },
  });

  // --- Sales tax on purchases ----------------------------------------------
  // Build Play pays Arizona TPT on materials at purchase. It is a cost, not a
  // line the customer sees, so it is internal-only but real money.
  let materialTaxCents = 0;
  if (!project.customerTaxExempt) {
    const taxableBase =
      (settings.tax.applyToMaterials ? taxableMaterialCents : 0) +
      (settings.tax.applyToRentals ? taxableRentalCents : 0);
    materialTaxCents = percentOf(taxableBase, settings.tax.materialSalesTaxPct);
    if (materialTaxCents > 0) {
      lineItems.push({
        category: "tax",
        sortOrder: 10,
        description: "Sales tax on materials and rentals (cost, not billed to customer)",
        quantity: 1,
        unit: "lump_sum",
        unitCostCents: materialTaxCents,
        costCents: materialTaxCents,
        internalOnly: !settings.tax.showOnEstimate,
        source: { type: "setting", label: "Sales tax" },
        calculation: {
          inputs: {
            taxableMaterials: taxableMaterialCents / 100,
            taxableRentals: settings.tax.applyToRentals ? taxableRentalCents / 100 : 0,
            ratePct: settings.tax.materialSalesTaxPct,
          },
          formula: "taxableBase x salesTaxPercent",
          explanation:
            `Arizona TPT at ${settings.tax.materialSalesTaxPct}% on taxable purchases. Build Play pays this, ` +
            "so it is carried as a cost and recovered through the margin rather than added to the customer's total.",
        },
      });
    }
  } else {
    assumptions.push("Customer is tax exempt; no sales tax carried on materials.");
  }

  // --- Manual lines ---------------------------------------------------------
  let otherCostCents = 0;
  sort = 0;
  for (const manual of input.manualLines) {
    const cost = Math.round(manual.quantity * manual.unitCostCents);
    otherCostCents += cost;
    lineItems.push({
      category: manual.category,
      sortOrder: 900 + (sort += 10),
      description: manual.description,
      quantity: manual.quantity,
      unit: manual.unit,
      unitCostCents: manual.unitCostCents,
      costCents: cost,
      manual: true,
      internalOnly: manual.internalOnly,
      source: { type: "manual", label: "Entered by estimator" },
      calculation: {
        inputs: { quantity: manual.quantity, unitCost: manual.unitCostCents / 100 },
        formula: "quantity x unitCost",
        explanation: manual.note ?? "Added by hand on this estimate.",
      },
    });
  }

  // ---------------------------------------------------------------- layer 4
  const directCostCents = sumCents([
    laborCostCents, materialCostCents, materialTaxCents, consumablesCostCents,
    equipmentCostCents, rentalCostCents, subcontractorCostCents,
    mobilizationCostCents, otherCostCents,
  ]);

  const overheadCostCents = percentOf(directCostCents, settings.overhead.percentOfDirectCost);
  const contingencyCostCents = percentOf(directCostCents, settings.contingency.percentOfDirectCost);
  const totalCostCents = directCostCents + overheadCostCents + contingencyCostCents;

  lineItems.push({
    category: "overhead",
    sortOrder: 10,
    description: "Overhead",
    quantity: 1,
    unit: "lump_sum",
    unitCostCents: overheadCostCents,
    costCents: overheadCostCents,
    internalOnly: true,
    source: { type: "setting", label: "Overhead" },
    calculation: {
      inputs: { directCost: directCostCents / 100, percent: settings.overhead.percentOfDirectCost },
      formula: "directCost x overheadPercent",
      explanation:
        `The cost of being in business on a day nobody is on site -- office, insurance, software, ` +
        `advertising, non-field time -- recovered at ${settings.overhead.percentOfDirectCost}% of direct cost.`,
    },
  });

  lineItems.push({
    category: "contingency",
    sortOrder: 20,
    description: "Contingency",
    quantity: 1,
    unit: "lump_sum",
    unitCostCents: contingencyCostCents,
    costCents: contingencyCostCents,
    internalOnly: true,
    source: { type: "setting", label: "Contingency" },
    calculation: {
      inputs: { directCost: directCostCents / 100, percent: settings.contingency.percentOfDirectCost },
      formula: "directCost x contingencyPercent",
      explanation: `${settings.contingency.percentOfDirectCost}% of direct cost held back for what goes wrong.`,
    },
  });

  // ---------------------------------------------------------------- layer 5
  const pricing = calculatePricing(
    totalCostCents,
    directCostCents,
    project.jobType,
    settings,
    input.pricingOverride,
  );

  if (pricing.belowFloor) {
    warnings.push({
      level: "error",
      message:
        `The selected price is a ${pricing.realizedMarginPct}% gross margin, below the ` +
        `${settings.pricing.hardFloorMarginPct}% floor.`,
      ref: "pricing.floor",
    });
  }

  // --- Assumptions the estimate should state out loud -----------------------
  assumptions.push(
    `Labor: ${totalAdjustedHours} man-hours` +
      (totalAdjustedHours !== totalRawHours ? ` (${totalRawHours} before site factors)` : "") +
      `, about ${crewDays} crew day${crewDays === 1 ? "" : "s"} with a crew of ${laborRate.crewSize}.`,
  );
  if (site.applied.length > 0) {
    assumptions.push(
      "Site conditions rated: " +
        site.applied.map((a) => `${a.label} ${a.rating}/10`).join(", ") + ".",
    );
  }
  if (rentalRequirements.length > 0) {
    assumptions.push(
      "Equipment rental durations assumed: " +
        rentalRequirements.map((r) => `${r.name} ${r.days} day${r.days === 1 ? "" : "s"}`).join(", ") + ".",
    );
  }

  const specialtyTools = Array.from(
    new Set(playground.components.flatMap((c) => c.specialtyTools ?? [])),
  );

  return {
    requirements: {
      laborHours: {
        componentInstall: adjustedHours.componentInstall,
        concrete: adjustedHours.concrete,
        surfacing: adjustedHours.surfacing,
        excavation: adjustedHours.excavation,
        demolition: adjustedHours.demolition,
        other: adjustedHours.other,
        total: totalRawHours,
        adjustedTotal: totalAdjustedHours,
      },
      crewDays,
      equipment: equipmentRequirements,
      rentals: rentalRequirements,
      specialtyTools,
    },
    siteMultipliers: m,
    appliedRatings: site.applied,
    lineItems,
    totals: {
      laborCostCents,
      materialCostCents,
      materialTaxCents,
      consumablesCostCents,
      equipmentCostCents,
      rentalCostCents,
      subcontractorCostCents,
      mobilizationCostCents,
      otherCostCents,
      directCostCents,
      overheadCostCents,
      contingencyCostCents,
      totalCostCents,
    },
    pricing: {
      jobType: pricing.jobType,
      sizeBand: pricing.sizeBand,
      margins: pricing.margins,
      prices: pricing.prices,
      selectedTier: pricing.selectedTier,
      manualPriceCents: pricing.manualPriceCents,
      sellingPriceCents: pricing.sellingPriceCents,
      realizedMarginPct: pricing.realizedMarginPct,
      grossProfitCents: pricing.grossProfitCents,
    },
    warnings,
    assumptions,
  };
}
