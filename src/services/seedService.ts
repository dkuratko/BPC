/**
 * All the seed / bootstrap logic, as a plain importable function.
 *
 * Two callers:
 *   - seed/seed.ts        the CLI (`npm run seed`, `npm run seed:reset`)
 *   - src/instrumentation.ts   runs this automatically on every server boot, so a
 *     freshly installed desktop app (or a wiped database) always has an admin
 *     login, default settings, and the reference data an estimate needs --
 *     without anyone having to remember to run a script first.
 *
 * Idempotent by construction: everything below is `findOneAndUpdate` with
 * `$setOnInsert`, or a `countDocuments() === 0` guard, so running it against an
 * already-seeded database on every startup is cheap and makes no changes.
 *
 * IMPORTANT: every rate in here is a placeholder, not a Build Play number.
 * Wages, rental prices, material prices, overhead and the site-factor
 * percentages all need replacing with real figures before a quote goes out.
 * They are marked as such in the notes on each record.
 */

import { connectDb } from "@/lib/db";
import { hashPassword } from "@/lib/authNode";
import { toCents } from "@/lib/money";
import {
  Counter, Customer, Equipment, Estimate, EstimateLineItem, Job, LaborRate,
  Manufacturer, Material, PGAssembly, PGComponent, Project, RentalRate,
  Settings, SiteFactor, SourceDocument, SubcontractorRate, User, Vendor,
} from "@/models";
import { saveEstimate } from "@/services/estimateService";

const PLACEHOLDER = "PLACEHOLDER \u2014 replace with a real Build Play figure.";

export interface SeedOptions {
  /** Wipe every seedable collection before seeding. Never used automatically. */
  reset?: boolean;
}

export interface SeedCounts {
  users: number;
  siteFactors: number;
  equipment: number;
  vendors: number;
  rentalRates: number;
  laborRates: number;
  materials: number;
  manufacturers: number;
  components: number;
  assemblies: number;
  projects: number;
  estimates: number;
}

export async function runSeed({ reset = false }: SeedOptions = {}): Promise<SeedCounts> {
  await connectDb();
  console.log(`Connected to ${process.env.MONGODB_URI}`);

  if (reset) {
    console.log("Resetting collections…");
    await Promise.all([
      Counter.deleteMany({}), Customer.deleteMany({}), Equipment.deleteMany({}),
      Estimate.deleteMany({}), EstimateLineItem.deleteMany({}), Job.deleteMany({}),
      LaborRate.deleteMany({}), Manufacturer.deleteMany({}), Material.deleteMany({}),
      PGAssembly.deleteMany({}), PGComponent.deleteMany({}), Project.deleteMany({}),
      RentalRate.deleteMany({}), Settings.deleteMany({}), SiteFactor.deleteMany({}),
      SourceDocument.deleteMany({}), SubcontractorRate.deleteMany({}),
      User.deleteMany({}), Vendor.deleteMany({}),
    ]);
  }

  /* ------------------------------------------------------------- settings */
  await Settings.findOneAndUpdate(
    { key: "default" },
    {
      $setOnInsert: {
        key: "default",
        company: {
          name: "Build Play Contracting",
          address: { city: "Phoenix", state: "AZ" },
          estimateFooter: "This estimate is valid for 30 days from the date issued.",
        },
        pricing: {
          defaultMargins: { minimumPct: 30, competitivePct: 33, targetPct: 38 },
          hardFloorMarginPct: 30,
          marginPresets: [
            // Public work is fought over on price; private work carries better margin.
            { jobType: "school_district", sizeBand: "large", margins: { minimumPct: 30, competitivePct: 32, targetPct: 35 }, note: PLACEHOLDER },
            { jobType: "municipal_parks", sizeBand: "large", margins: { minimumPct: 30, competitivePct: 32, targetPct: 35 }, note: PLACEHOLDER },
            { jobType: "residential", sizeBand: "small", margins: { minimumPct: 32, competitivePct: 38, targetPct: 45 }, note: PLACEHOLDER },
            { jobType: "hoa", sizeBand: "small", margins: { minimumPct: 30, competitivePct: 35, targetPct: 42 }, note: PLACEHOLDER },
          ],
        },
        overhead: { percentOfDirectCost: 12, note: PLACEHOLDER },
        contingency: { percentOfDirectCost: 5, note: PLACEHOLDER },
        consumables: { enabled: true, percentOfLaborCost: 3, note: PLACEHOLDER },
        tax: { materialSalesTaxPct: 8.6, applyToMaterials: true, applyToRentals: true, showOnEstimate: false, note: `${PLACEHOLDER} Phoenix-area TPT rate.` },
        componentLaborInference: {
          enabled: true,
          defaultHoursPer100Lb: 1.0,
          byCategory: [
            { category: "deck", hoursPer100Lb: 0.7, footingsPer100Lb: 0.5, note: PLACEHOLDER },
            { category: "post", hoursPer100Lb: 0.9, footingsPer100Lb: 1.2, note: PLACEHOLDER },
            { category: "climber", hoursPer100Lb: 1.4, note: PLACEHOLDER },
            { category: "slide", hoursPer100Lb: 1.1, note: PLACEHOLDER },
            { category: "roof", hoursPer100Lb: 1.8, note: `${PLACEHOLDER} Roofs are slow: height, lifting, alignment.` },
            { category: "panel", hoursPer100Lb: 1.0, note: PLACEHOLDER },
            { category: "swing", hoursPer100Lb: 1.2, note: PLACEHOLDER },
            { category: "bridge", hoursPer100Lb: 1.0, note: PLACEHOLDER },
            { category: "spinner", hoursPer100Lb: 1.6, note: PLACEHOLDER },
            { category: "overhead_event", hoursPer100Lb: 1.5, note: PLACEHOLDER },
            { category: "freestanding", hoursPer100Lb: 1.3, note: PLACEHOLDER },
          ],
        },
      },
    },
    { upsert: true, new: true },
  );

  /* ----------------------------------------------------------------- user */
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@buildplay.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "changeme-please-1";
  if (!(await User.findOne({ email: adminEmail }))) {
    await User.create({
      name: "Build Play Admin",
      email: adminEmail,
      role: "admin",
      passwordHash: await hashPassword(adminPassword),
    });
    console.log(`Created admin ${adminEmail} / ${adminPassword} — change this password.`);
  }

  /* --------------------------------------------------------- site factors */
  const siteFactors = [
    {
      key: "carry_distance", label: "Carry distance from staging to the play area", sortOrder: 10,
      description: "How far material and parts have to travel once they are off the truck.",
      ratingLabels: [
        { rating: 1, label: "Truck backs onto the pad" },
        { rating: 5, label: "Normal — a short wheelbarrow run" },
        { rating: 8, label: "Around a building, several hundred feet" },
        { rating: 10, label: "No vehicle access; everything carried a long way" },
      ],
      impacts: [
        { target: "install_labor", percentPerPoint: 3 },
        // Surfacing is the killer here: it is volume, and every yard gets moved by hand.
        { target: "surfacing_labor", percentPerPoint: 9 },
        { target: "mobilization", percentPerPoint: 2 },
      ],
    },
    {
      key: "machine_access", label: "Machine access", sortOrder: 20,
      description: "Whether the skid steer and a telehandler can actually get to the work.",
      ratingLabels: [
        { rating: 1, label: "Wide open, gates off" },
        { rating: 5, label: "Normal gate, some manoeuvring" },
        { rating: 10, label: "No machine access at all — hand dig and carry" },
      ],
      impacts: [
        { target: "install_labor", percentPerPoint: 4 },
        { target: "excavation_labor", percentPerPoint: 6 },
        { target: "rental_days", percentPerPoint: 2 },
      ],
    },
    {
      key: "soil", label: "Digging conditions", sortOrder: 30,
      description: "What the footings have to go through.",
      ratingLabels: [
        { rating: 1, label: "Soft, clean sand" },
        { rating: 5, label: "Normal AZ soil" },
        { rating: 8, label: "Caliche — slow going" },
        { rating: 10, label: "Rock; breaker or coring required" },
      ],
      impacts: [
        { target: "excavation_labor", percentPerPoint: 9 },
        { target: "concrete_labor", percentPerPoint: 4 },
        { target: "install_labor", percentPerPoint: 2 },
      ],
    },
    {
      key: "slope", label: "Slope and grade", sortOrder: 40,
      impacts: [
        { target: "install_labor", percentPerPoint: 3 },
        { target: "surfacing_labor", percentPerPoint: 5 },
        { target: "excavation_labor", percentPerPoint: 5 },
      ],
    },
    {
      key: "utilities", label: "Utility congestion", sortOrder: 50,
      description: "Irrigation, conduit and anything else that has to be worked around.",
      impacts: [{ target: "excavation_labor", percentPerPoint: 7 }],
    },
    {
      key: "work_hours", label: "Work-hour restrictions", sortOrder: 60,
      description: "School in session, noise limits, night work, staged closures.",
      ratingLabels: [
        { rating: 1, label: "Site is ours, any hours" },
        { rating: 5, label: "Normal daytime work" },
        { rating: 10, label: "Nights or weekends only, students on site" },
      ],
      impacts: [
        { target: "install_labor", percentPerPoint: 5 },
        { target: "surfacing_labor", percentPerPoint: 5 },
        { target: "rental_days", percentPerPoint: 4 },
      ],
    },
    {
      key: "security", label: "Security, badging and check-in", sortOrder: 70,
      impacts: [
        { target: "install_labor", percentPerPoint: 2 },
        { target: "mobilization", percentPerPoint: 4 },
      ],
    },
    {
      key: "heat_season", label: "Heat and season", sortOrder: 80,
      description: "Phoenix in July is not Phoenix in February.",
      ratingLabels: [
        { rating: 1, label: "Mild winter work" },
        { rating: 5, label: "Spring or autumn" },
        { rating: 9, label: "Mid-summer, early starts and long breaks" },
      ],
      impacts: [
        { target: "install_labor", percentPerPoint: 4 },
        { target: "surfacing_labor", percentPerPoint: 5 },
        { target: "concrete_labor", percentPerPoint: 3 },
      ],
    },
    {
      key: "water_power", label: "Water and power on site", sortOrder: 90,
      description: "Mixing concrete without a hose costs time.",
      impacts: [{ target: "concrete_labor", percentPerPoint: 5 }],
    },
    {
      key: "existing_conditions", label: "Existing structure and surfacing to remove", sortOrder: 100,
      impacts: [{ target: "demolition_labor", percentPerPoint: 7 }],
    },
  ];

  for (const factor of siteFactors) {
    await SiteFactor.findOneAndUpdate(
      { key: factor.key },
      { $setOnInsert: { ...factor, scale: { min: 1, max: 10, baseline: 5 } } },
      { upsert: true },
    );
  }

  /* --------------------------------------------------------- labor rates */
  if ((await LaborRate.countDocuments()) === 0) {
    await LaborRate.create([
      {
        name: "3-man install crew", type: "crew", crewSize: 3,
        composition: "Lead installer + 2 installers",
        baseWageCents: toCents(26),
        burden: { payrollTaxPct: 9.5, workersCompPct: 10, benefitsPct: 5, otherPct: 2, overheadAllocationPct: 0 },
        isDefault: true,
        notes: `${PLACEHOLDER} Base wage and workers comp especially — comp rates for playground/landscape construction vary a lot.`,
      },
      {
        name: "2-man crew", type: "crew", crewSize: 2, baseWageCents: toCents(25),
        burden: { payrollTaxPct: 9.5, workersCompPct: 10, benefitsPct: 5, otherPct: 2, overheadAllocationPct: 0 },
        notes: PLACEHOLDER,
      },
      {
        name: "Lead installer (single)", type: "employee", crewSize: 1, baseWageCents: toCents(32),
        burden: { payrollTaxPct: 9.5, workersCompPct: 10, benefitsPct: 5, otherPct: 2, overheadAllocationPct: 0 },
        notes: PLACEHOLDER,
      },
    ]);
  }

  /* ----------------------------------------------------------- equipment */
  const equipmentSeed = [
    {
      name: "Bobcat T66 track loader", type: "skid_steer", ownership: "owned", makeModel: "Bobcat T66",
      internalRate: { hourlyCents: toCents(45), dailyCents: toCents(320), note: PLACEHOLDER },
      transportWeightLb: 9200, fuel: { gallonsPerDay: 8 },
      specifications: { capacityLb: 2100 },
      notes: "Build Play owned.",
    },
    {
      name: "Ford F450", type: "truck", ownership: "owned", makeModel: "2012 Ford F450", year: 2012,
      internalRate: { hourlyCents: toCents(18), dailyCents: toCents(140), note: PLACEHOLDER },
      transportWeightLb: 0, notes: "Build Play owned. Hauls the trailer; its own weight is not cargo.",
    },
    {
      name: "20 ft equipment trailer", type: "trailer", ownership: "owned",
      internalRate: { hourlyCents: 0, dailyCents: toCents(45), note: PLACEHOLDER },
      transportWeightLb: 0, specifications: { capacityLb: 7000 },
      notes: "Build Play owned. Capacity drives how many mobilization trips a job needs.",
    },
    { name: "Telehandler (rented)", type: "telehandler", ownership: "rented", specifications: { capacityLb: 6000, maxLiftHeightFt: 42 } },
    { name: "Towable auger", type: "auger", ownership: "rented" },
    { name: 'Auger bit 12"', type: "auger_bit", ownership: "rented" },
    { name: 'Auger bit 18"', type: "auger_bit", ownership: "rented" },
    { name: "Walk-behind concrete saw", type: "concrete_saw", ownership: "rented" },
    { name: "Mini excavator", type: "mini_excavator", ownership: "rented" },
    { name: "Plate compactor", type: "compactor", ownership: "rented" },
  ];
  for (const eq of equipmentSeed) {
    await Equipment.findOneAndUpdate({ name: eq.name }, { $setOnInsert: eq }, { upsert: true });
  }

  /* ------------------------------------------------------------- vendors */
  const vendorSeed = [
    { name: "Sunstate Equipment", types: ["rental"], address: { city: "Phoenix", state: "AZ" } },
    { name: "United Rentals", types: ["rental"], address: { city: "Phoenix", state: "AZ" } },
    { name: "Home Depot Rental", types: ["rental", "material"], address: { city: "Phoenix", state: "AZ" } },
    { name: "Local ready-mix supplier", types: ["material"], address: { city: "Phoenix", state: "AZ" }, notes: PLACEHOLDER },
    { name: "Surfacing subcontractor", types: ["subcontractor"], address: { city: "Phoenix", state: "AZ" }, notes: PLACEHOLDER },
  ];
  for (const v of vendorSeed) {
    await Vendor.findOneAndUpdate({ name: v.name }, { $setOnInsert: v }, { upsert: true });
  }

  const vendors = new Map((await Vendor.find()).map((v) => [v.name, v._id]));
  const equipment = new Map((await Equipment.find()).map((e) => [e.name, e._id]));

  /* -------------------------------------------------------- rental rates */
  if ((await RentalRate.countDocuments()) === 0) {
    // Two vendors for the telehandler on purpose: the engine picks the cheaper
    // one for the duration, and the comparison screen shows what that saved.
    await RentalRate.create([
      {
        equipmentId: equipment.get("Telehandler (rented)"), vendorId: vendors.get("Sunstate Equipment"),
        rates: { dailyCents: toCents(385), weeklyCents: toCents(1150), monthlyCents: toCents(2900) },
        fees: { deliveryCents: toCents(150), pickupCents: toCents(150), environmentalPct: 3, damageWaiverPct: 14 },
        minimumRental: { quantity: 1, unit: "day" }, effectiveDate: new Date(), quoteReference: PLACEHOLDER,
      },
      {
        equipmentId: equipment.get("Telehandler (rented)"), vendorId: vendors.get("United Rentals"),
        rates: { dailyCents: toCents(410), weeklyCents: toCents(1090), monthlyCents: toCents(2750) },
        fees: { deliveryCents: toCents(125), pickupCents: toCents(125), environmentalPct: 2.5, damageWaiverPct: 14 },
        minimumRental: { quantity: 1, unit: "day" }, effectiveDate: new Date(), quoteReference: PLACEHOLDER,
      },
      {
        equipmentId: equipment.get("Towable auger"), vendorId: vendors.get("Sunstate Equipment"),
        rates: { dailyCents: toCents(185), weeklyCents: toCents(555) },
        fees: { deliveryCents: toCents(95), pickupCents: toCents(95) },
        effectiveDate: new Date(), quoteReference: PLACEHOLDER,
      },
      {
        equipmentId: equipment.get('Auger bit 12"'), vendorId: vendors.get("Sunstate Equipment"),
        rates: { dailyCents: toCents(35), weeklyCents: toCents(105) }, fees: {},
        effectiveDate: new Date(), quoteReference: PLACEHOLDER,
      },
      {
        equipmentId: equipment.get("Walk-behind concrete saw"), vendorId: vendors.get("Home Depot Rental"),
        rates: { dailyCents: toCents(115), weeklyCents: toCents(345) }, fees: {},
        effectiveDate: new Date(), quoteReference: PLACEHOLDER,
      },
      {
        equipmentId: equipment.get("Mini excavator"), vendorId: vendors.get("United Rentals"),
        rates: { dailyCents: toCents(340), weeklyCents: toCents(1020) },
        fees: { deliveryCents: toCents(150), pickupCents: toCents(150) },
        effectiveDate: new Date(), quoteReference: PLACEHOLDER,
      },
    ]);
  }

  /* ----------------------------------------------------------- materials */
  if ((await Material.countDocuments()) === 0) {
    await Material.create([
      {
        name: "Ready-mix concrete 3000 psi", category: "concrete", defaultUnit: "cu_yd", concreteRole: "ready_mix",
        pricingOptions: [{ unit: "cu_yd", unitCostCents: toCents(185), fixedFeeCents: toCents(150), minimumQuantity: 1, note: `${PLACEHOLDER} Includes a short-load delivery fee.` }],
        specifications: { strength: "3000 psi", slump: "4 in" }, wasteFactorPct: 0, taxable: true,
        preferredVendorId: vendors.get("Local ready-mix supplier"),
      },
      {
        name: "Concrete mix, 80 lb bag", category: "concrete", defaultUnit: "bag", concreteRole: "bagged",
        bagWeightLb: 80,
        pricingOptions: [{ unit: "bag", unitCostCents: toCents(6.25), note: PLACEHOLDER }],
        wasteFactorPct: 0, taxable: true,
      },
      {
        name: "Engineered wood fibre (EWF)", category: "surfacing_ewf", defaultUnit: "cu_yd",
        pricingOptions: [
          { unit: "cu_yd", unitCostCents: toCents(42), laborHoursPerUnit: 0.35, note: `${PLACEHOLDER} Delivered.` },
          { unit: "sq_ft", unitCostCents: toCents(1.55), laborHoursPerUnit: 0.012, note: `${PLACEHOLDER} Installed at 12 in depth.` },
          { unit: "ton", unitCostCents: toCents(95), laborHoursPerUnit: 0.9, note: `${PLACEHOLDER} Usually for removal and haul-off.` },
        ],
        wasteFactorPct: 8, taxable: true,
      },
      {
        name: "Poured-in-place rubber (PIP)", category: "surfacing_pip", defaultUnit: "sq_ft",
        pricingOptions: [{ unit: "sq_ft", unitCostCents: toCents(18), laborHoursPerUnit: 0, note: `${PLACEHOLDER} Normally subcontracted.` }],
        wasteFactorPct: 5, taxable: true,
      },
      {
        name: "Aggregate base", category: "aggregate", defaultUnit: "ton",
        pricingOptions: [{ unit: "ton", unitCostCents: toCents(28), laborHoursPerUnit: 0.5, note: PLACEHOLDER }],
        wasteFactorPct: 10, taxable: true,
      },
      {
        name: "Geotextile fabric", category: "geotextile", defaultUnit: "sq_ft",
        pricingOptions: [{ unit: "sq_ft", unitCostCents: toCents(0.22), laborHoursPerUnit: 0.004, note: PLACEHOLDER }],
        wasteFactorPct: 10, taxable: true,
      },
      {
        name: "Timber border with stakes", category: "border_curbing", defaultUnit: "linear_ft",
        pricingOptions: [{ unit: "linear_ft", unitCostCents: toCents(9.5), laborHoursPerUnit: 0.08, note: PLACEHOLDER }],
        wasteFactorPct: 5, taxable: true,
      },
      {
        name: "Debris haul-off and disposal", category: "disposal", defaultUnit: "ton",
        pricingOptions: [{ unit: "ton", unitCostCents: toCents(65), note: PLACEHOLDER }],
        taxable: false,
      },
    ]);
  }

  /* ------------------------------------------------ subcontractor rates */
  if ((await SubcontractorRate.countDocuments()) === 0) {
    await SubcontractorRate.create([
      {
        vendorId: vendors.get("Surfacing subcontractor"), service: "Poured-in-place rubber, installed",
        category: "surfacing", unit: "sq_ft", unitCostCents: toCents(16.5),
        minimumChargeCents: toCents(4500), markupPct: 0, scopeNotes: PLACEHOLDER,
      },
      {
        vendorId: vendors.get("Surfacing subcontractor"), service: "Existing surfacing removal",
        category: "demolition", unit: "ton", unitCostCents: toCents(85),
        minimumChargeCents: toCents(1200), markupPct: 0, scopeNotes: PLACEHOLDER,
      },
    ]);
  }

  /* ------------------------------------------------------ manufacturers */
  const manufacturerSeed = [
    { name: "Landscape Structures", website: "https://www.playlsi.com", productLines: ["PlayBooster", "PlayShaper", "Weevos"], documentConventions: { quoteFormat: "Itemised quote with part number, description, weight, quantity, price, plus an installation summary.", parserType: "landscape_structures" } },
    { name: "Anova", productLines: ["Site furnishings"], documentConventions: { parserType: "generic" } },
    { name: "DuMor", productLines: ["Site furnishings"], documentConventions: { parserType: "generic" } },
    { name: "EYV", documentConventions: { parserType: "generic", notes: "Name taken from a shorthand note — confirm the full manufacturer name." } },
  ];
  for (const m of manufacturerSeed) {
    await Manufacturer.findOneAndUpdate({ name: m.name }, { $setOnInsert: m }, { upsert: true });
  }
  const lsi = await Manufacturer.findOne({ name: "Landscape Structures" });

  /* ------------------------------------------ demo components and preset */
  // Modelled on the PlayBooster 2-12 example in the schema document: 19 footings,
  // 40.6 cu ft of concrete, 43.3 labor hours, 3,246 lb, 613 sq ft safety zone.
  const demoComponents = [
    { partNumber: "DEMO-DECK-01", name: "Square deck", category: "deck", weightLb: 165, installation: { footingCount: 1, concreteCuFt: 2.1 } },
    { partNumber: "DEMO-POST-01", name: 'Aluminium post, 5" x 12 ft', category: "post", weightLb: 78, installation: { footingCount: 1, concreteCuFt: 2.1 } },
    { partNumber: "DEMO-SLIDE-01", name: "Double slide, 5 ft deck height", category: "slide", weightLb: 240, installation: { footingCount: 2, concreteCuFt: 3.2 } },
    { partNumber: "DEMO-ROOF-01", name: "Gable roof", category: "roof", weightLb: 190, installation: { footingCount: 0, concreteCuFt: 0, complexity: 1.4 } },
    { partNumber: "DEMO-CLIMB-01", name: "Arch climber", category: "climber", weightLb: 155, installation: { footingCount: 2, concreteCuFt: 2.6 } },
    { partNumber: "DEMO-PANEL-01", name: "Activity panel", category: "panel", weightLb: 62, installation: { footingCount: 0, concreteCuFt: 0 } },
    { partNumber: "DEMO-BRIDGE-01", name: "Clatter bridge", category: "bridge", weightLb: 210, installation: { footingCount: 2, concreteCuFt: 2.8 } },
    { partNumber: "DEMO-TRANSFER-01", name: "Transfer module with steps", category: "ramp_transfer", weightLb: 320, installation: { footingCount: 3, concreteCuFt: 4.2 } },
  ];

  if (lsi && (await PGComponent.countDocuments({ manufacturerId: lsi._id })) === 0) {
    for (const c of demoComponents) {
      await PGComponent.create({
        manufacturerId: lsi._id,
        partNumber: c.partNumber,
        name: c.name,
        category: c.category,
        weightLb: c.weightLb,
        installation: {
          ...c.installation,
          complexity: c.installation.complexity ?? 1,
          // Deliberately no baseLaborHours: these are demo parts, so the engine
          // infers hours from weight and flags them as unverified, which is
          // exactly what will happen with real parts until they have been timed.
          laborSource: "inferred_weight",
          verified: false,
        },
        notes: "Demo component created by the seed script. Replace with real catalogue data.",
      });
    }

    const created = await PGComponent.find({ manufacturerId: lsi._id });
    const byPart = new Map(created.map((c) => [c.partNumber, c._id]));

    await PGAssembly.create({
      manufacturerId: lsi._id,
      modelNumber: "DEMO-PB-2-12",
      name: "Demo PlayBooster structure, ages 2-12",
      ageRange: "2-12",
      components: [
        { componentId: byPart.get("DEMO-DECK-01"), quantity: 4 },
        { componentId: byPart.get("DEMO-POST-01"), quantity: 8 },
        { componentId: byPart.get("DEMO-SLIDE-01"), quantity: 1 },
        { componentId: byPart.get("DEMO-ROOF-01"), quantity: 1 },
        { componentId: byPart.get("DEMO-CLIMB-01"), quantity: 2 },
        { componentId: byPart.get("DEMO-PANEL-01"), quantity: 3 },
        { componentId: byPart.get("DEMO-BRIDGE-01"), quantity: 1 },
        { componentId: byPart.get("DEMO-TRANSFER-01"), quantity: 1 },
      ],
      manufacturerSummary: {
        laborHours: 43.3, footingCount: 19, concreteCuFt: 40.6,
        totalWeightLb: 3246, safetyZoneSqFt: 613,
      },
      notes: "Figures taken from the worked example in the schema document. Demo data.",
    });
  }

  /* ------------------------------------------------- demo customer & job */
  const customer = await Customer.findOneAndUpdate(
    { companyName: "Sunrise Elementary School District" },
    {
      $setOnInsert: {
        companyName: "Sunrise Elementary School District",
        jobType: "school_district",
        taxExempt: false,
        billingAddress: { city: "Phoenix", state: "AZ" },
        contacts: [{ name: "Facilities Director", email: "facilities@example.org", primary: true }],
        notes: "Demo customer created by the seed script.",
      },
    },
    { upsert: true, new: true },
  );

  const assembly = await PGAssembly.findOne({ modelNumber: "DEMO-PB-2-12" });

  let project = await Project.findOne({ name: "Sunrise Elementary — main playground" });
  if (!project && customer) {
    project = await Project.create({
      customerId: customer._id,
      name: "Sunrise Elementary — main playground",
      jobType: "school_district",
      location: { address: { city: "Phoenix", state: "AZ" }, milesFromYard: 18 },
      playground: { sourceType: "preset", ageRange: "2-12", manufacturerId: lsi?._id, assemblyId: assembly?._id },
      site: {
        ratings: [
          { factorKey: "carry_distance", rating: 7, note: "Play area is behind the building; no vehicle access." },
          { factorKey: "machine_access", rating: 6 },
          { factorKey: "soil", rating: 6, note: "Caliche expected." },
          { factorKey: "slope", rating: 5 },
          { factorKey: "utilities", rating: 5 },
          { factorKey: "work_hours", rating: 7, note: "Summer break only." },
          { factorKey: "security", rating: 6 },
          { factorKey: "heat_season", rating: 9, note: "July install." },
          { factorKey: "water_power", rating: 4 },
          { factorKey: "existing_conditions", rating: 5 },
        ],
        soilDescription: "Caliche under 6 in of decomposed granite",
        existingSurface: "Engineered wood fibre, to be topped up",
      },
      scope: {
        playgroundInstallation: true, concrete: true, excavation: false,
        surfacing: true, demolition: false, disposal: false, curbing: true, shade: false, other: [],
      },
      status: "estimating",
      notes: "Demo project created by the seed script.",
    });
  }

  /* ---------------------------------------------------- a demo estimate */
  if (project && assembly && (await Estimate.countDocuments({ projectId: project._id })) === 0) {
    const laborRate = await LaborRate.findOne({ isDefault: true });
    const ewf = await Material.findOne({ name: "Engineered wood fibre (EWF)" });
    const border = await Material.findOne({ name: "Timber border with stakes" });
    const telehandler = await Equipment.findOne({ name: "Telehandler (rented)" });
    const auger = await Equipment.findOne({ name: "Towable auger" });
    const t66 = await Equipment.findOne({ name: "Bobcat T66 track loader" });

    await saveEstimate(String(project._id), {
      laborRateId: laborRate ? String(laborRate._id) : null,
      laborBasis: "manufacturer",
      playground: {
        sourceType: "preset",
        assemblyId: String(assembly._id),
        assemblyQuantity: 1,
        modelDescription: "Demo PlayBooster structure, ages 2-12",
        ageRange: "2-12",
        components: [],
      },
      materials: [
        ...(ewf ? [{ materialId: String(ewf._id), unit: "cu_yd" as const, quantity: 24, laborBucket: "surfacing" as const }] : []),
        ...(border ? [{ materialId: String(border._id), unit: "linear_ft" as const, quantity: 96, laborBucket: "other" as const }] : []),
      ],
      rentals: [
        ...(telehandler ? [{ equipmentId: String(telehandler._id), days: 2, reason: "Roof and upper decks over 8 ft" }] : []),
        ...(auger ? [{ equipmentId: String(auger._id), days: 1, reason: "19 footings in caliche" }] : []),
      ],
      ownedEquipment: t66 ? [{ equipmentId: String(t66._id), days: 3 }] : [],
      extraLabor: [{ description: "Layout, punch list and clean-up", hours: 8, bucket: "other" }],
      siteRatings: project.site.ratings.map((r) => ({ factorKey: r.factorKey, rating: r.rating, note: r.note })),
      pricing: { selectedTier: "target" },
      exclusions: [
        "Permits and plan review fees",
        "Utility locating beyond a standard Blue Stake request",
        "Irrigation modification or repair",
        "Fencing, shade structures and site furnishings unless listed",
      ],
      notes: "Demo estimate created by the seed script from placeholder rates.",
    });
  }

  const counts = {
    users: await User.countDocuments(),
    siteFactors: await SiteFactor.countDocuments(),
    equipment: await Equipment.countDocuments(),
    vendors: await Vendor.countDocuments(),
    rentalRates: await RentalRate.countDocuments(),
    laborRates: await LaborRate.countDocuments(),
    materials: await Material.countDocuments(),
    manufacturers: await Manufacturer.countDocuments(),
    components: await PGComponent.countDocuments(),
    assemblies: await PGAssembly.countDocuments(),
    projects: await Project.countDocuments(),
    estimates: await Estimate.countDocuments(),
  };
  console.table(counts);
  console.log("\nEvery rate seeded here is a placeholder. Replace them under Settings and Master data");
  console.log("before an estimate goes to a customer.\n");

  return counts;
}
