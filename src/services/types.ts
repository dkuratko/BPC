import type { Unit } from "@/lib/units";
import type { JobType, SizeBand } from "@/models/Settings";
import type { FactorTarget } from "@/models/SiteFactor";
import type { LineCategory, SourceType } from "@/models/EstimateLineItem";

/**
 * The engine works on plain objects, not Mongoose documents. Everything it
 * needs is loaded and flattened first (see estimateService), which keeps the
 * calculation pure, unit-testable without a database, and reproducible from a
 * stored snapshot.
 */

export interface NormalizedComponent {
  componentId?: string | null;
  partNumber?: string;
  name: string;
  quantity: number;
  weightLb: number;
  /** Man-hours to install ONE of these, before complexity and site factors. */
  laborHoursEach: number;
  laborSource: string;
  verified: boolean;
  complexity: number;
  footingCountEach: number;
  concreteCuFtEach: number;
  equipment?: Array<{ equipmentId: string; quantity: number; hours?: number; days?: number; required: boolean }>;
  specialtyTools?: string[];
}

export interface NormalizedPlayground {
  sourceType: "custom" | "preset" | "unknown";
  modelDescription?: string;
  ageRange?: string;
  assemblyId?: string | null;
  components: NormalizedComponent[];
  totals: {
    weightLb: number;
    footingCount: number;
    concreteCuFt: number;
    /** Rolled up from our component library. */
    componentLaborHours: number;
    /** As published by the manufacturer for the whole structure, if known. */
    manufacturerLaborHours: number;
    safetyZoneSqFt: number;
  };
  /** Components we could not match to the library, carried so nothing is lost. */
  unmatched: Array<{ partNumber?: string; description?: string; quantity: number }>;
}

export interface LaborRateInput {
  laborRateId?: string | null;
  name: string;
  crewSize: number;
  /** Cost of one person-hour, fully burdened. */
  fullyBurdenedCents: number;
}

/** Extra labor the estimator enters directly: excavation, demo, punch list. */
export interface ExtraLaborInput {
  description: string;
  hours: number;
  bucket: "excavation" | "demolition" | "surfacing" | "concrete" | "other";
  note?: string;
}

export interface MaterialLineInput {
  materialId?: string | null;
  name: string;
  category: string;
  unit: Unit;
  quantity: number;
  unitCostCents: number;
  fixedFeeCents?: number;
  minimumChargeCents?: number;
  wasteFactorPct?: number;
  laborHoursPerUnit?: number;
  laborBucket?: "surfacing" | "concrete" | "excavation" | "demolition" | "other";
  taxable?: boolean;
  /** Site factors that scale material quantity apply unless this is opted out. */
  applySiteFactors?: boolean;
  note?: string;
}

export interface RentalLineInput {
  equipmentId?: string | null;
  equipmentName: string;
  vendorId?: string | null;
  vendorName?: string;
  rentalRateId?: string | null;
  days: number;
  /** Chosen by rentalPricingService; kept so the line can explain itself. */
  breakdown: RentalBreakdown;
  /**
   * The winning vendor's raw rate. Present when the engine may need to re-price
   * after a site factor stretches the rental duration; absent means the
   * breakdown above is taken as final.
   */
  rate?: {
    rates: { hourlyCents?: number; dailyCents?: number; weeklyCents?: number; monthlyCents?: number };
    fees: {
      deliveryCents?: number; pickupCents?: number; cleaningCents?: number;
      environmentalPct?: number; damageWaiverPct?: number; otherCents?: number;
    };
    fuelIncluded?: boolean;
    minimumRental?: { quantity?: number; unit?: "hour" | "day" | "week" };
  };
  fuelCostCents?: number;
  taxable?: boolean;
  reason?: string;
}

export interface RentalBreakdown {
  days: number;
  billedAs: "hourly" | "daily" | "weekly" | "monthly";
  billedQuantity: number;
  unitRateCents: number;
  rentalCents: number;
  deliveryCents: number;
  pickupCents: number;
  cleaningCents: number;
  environmentalCents: number;
  damageWaiverCents: number;
  otherCents: number;
  fuelCents: number;
  totalCents: number;
  explanation: string;
}

export interface OwnedEquipmentInput {
  equipmentId?: string | null;
  name: string;
  hours?: number;
  days?: number;
  hourlyCents?: number;
  dailyCents?: number;
  fuelCostCents?: number;
  transportWeightLb?: number;
  note?: string;
}

export interface SubcontractorLineInput {
  subcontractorRateId?: string | null;
  vendorName?: string;
  service: string;
  unit: Unit;
  quantity: number;
  unitCostCents: number;
  minimumChargeCents?: number;
  mobilizationCents?: number;
  markupPct?: number;
  note?: string;
}

export interface ManualLineInput {
  category: LineCategory;
  description: string;
  quantity: number;
  unit: Unit;
  unitCostCents: number;
  internalOnly?: boolean;
  note?: string;
}

export interface SiteRatingInput {
  factorKey: string;
  rating: number;
  note?: string;
}

export interface SiteFactorInput {
  key: string;
  label: string;
  scale: { min: number; max: number; baseline: number };
  impacts: Array<{ target: FactorTarget; percentPerPoint: number; curve?: Array<{ rating: number; multiplier: number }> }>;
}

/** The subset of Settings the engine reads. */
export interface EngineSettings {
  pricing: {
    defaultMargins: { minimumPct: number; competitivePct: number; targetPct: number };
    marginPresets: Array<{ jobType: JobType; sizeBand: SizeBand; margins: { minimumPct: number; competitivePct: number; targetPct: number } }>;
    sizeBandThresholds: { smallMaxDirectCostCents: number; mediumMaxDirectCostCents: number };
    hardFloorMarginPct: number;
  };
  overhead: { percentOfDirectCost: number };
  contingency: { percentOfDirectCost: number };
  consumables: { enabled: boolean; percentOfLaborCost: number };
  tax: { materialSalesTaxPct: number; applyToMaterials: boolean; applyToRentals: boolean; showOnEstimate: boolean };
  mobilization: {
    minimumChargeCents: number; perMileCents: number; roundTrip: boolean;
    trailerCapacityLb: number; perThousandLbCents: number;
    chargeCrewTravelTime: boolean; averageSpeedMph: number; loadUnloadHoursPerTrip: number;
  };
  labor: { manufacturerHoursMultiplier: number; productiveHoursPerCrewDay: number };
  concrete: {
    baggedMaxCuYd: number; wasteFactorPct: number; defaultBagWeightLb: number;
    handMixLaborHoursPerCuYd: number; readyMixLaborHoursPerCuYd: number;
  };
}

export interface ConcreteSupplyInput {
  /** Price of one cubic yard of ready-mix delivered, plus any short-load fee. */
  readyMix?: { materialId?: string | null; name: string; perCuYdCents: number; deliveryCents?: number; minimumCuYd?: number };
  /** Price of one bag, and the bag size the price refers to. */
  bagged?: { materialId?: string | null; name: string; perBagCents: number; bagWeightLb: number };
}

export interface EngineInput {
  settings: EngineSettings;
  project: {
    jobType: JobType;
    milesFromYard: number;
    customerTaxExempt?: boolean;
    scope: { concrete: boolean; surfacing: boolean; excavation: boolean; demolition: boolean; [k: string]: boolean | undefined };
  };
  siteFactors: SiteFactorInput[];
  siteRatings: SiteRatingInput[];
  playground: NormalizedPlayground;
  laborRate: LaborRateInput;
  /** Which labor baseline to trust for the structure itself. */
  laborBasis: "manufacturer" | "components";
  extraLabor: ExtraLaborInput[];
  materials: MaterialLineInput[];
  concreteSupply?: ConcreteSupplyInput;
  rentals: RentalLineInput[];
  ownedEquipment: OwnedEquipmentInput[];
  subcontractors: SubcontractorLineInput[];
  manualLines: ManualLineInput[];
  /** Base weight of tools and consumables always hauled, for mobilization. */
  baseHaulWeightLb?: number;
  pricingOverride?: {
    selectedTier?: "minimum" | "competitive" | "target" | "manual";
    manualPriceCents?: number | null;
    margins?: { minimumPct: number; competitivePct: number; targetPct: number };
  };
}

export interface DraftLineItem {
  category: LineCategory;
  sortOrder: number;
  description: string;
  quantity: number;
  unit: Unit;
  unitCostCents: number;
  costCents: number;
  internalOnly?: boolean;
  manual?: boolean;
  source: { type: SourceType; sourceId?: string | null; label?: string };
  calculation: { inputs?: Record<string, unknown>; formula?: string; explanation?: string };
}

export interface EngineWarning {
  level: "info" | "warning" | "error";
  message: string;
  ref?: string;
}

export interface EngineResult {
  requirements: {
    laborHours: {
      componentInstall: number; concrete: number; surfacing: number;
      excavation: number; demolition: number; other: number;
      total: number; adjustedTotal: number;
    };
    crewDays: number;
    equipment: Array<{ equipmentId?: string | null; name: string; hours?: number; days?: number; owned: boolean; reason?: string }>;
    rentals: Array<{ equipmentId?: string | null; name: string; days: number; vendorName?: string; reason?: string }>;
    specialtyTools: string[];
  };
  siteMultipliers: Record<FactorTarget, number>;
  appliedRatings: Array<{ factorKey: string; label: string; rating: number; baseline: number; impacts: Array<{ target: string; multiplier: number }>; note?: string }>;
  lineItems: DraftLineItem[];
  totals: {
    laborCostCents: number; materialCostCents: number; materialTaxCents: number;
    consumablesCostCents: number; equipmentCostCents: number; rentalCostCents: number;
    subcontractorCostCents: number; mobilizationCostCents: number; otherCostCents: number;
    directCostCents: number; overheadCostCents: number; contingencyCostCents: number;
    totalCostCents: number;
  };
  pricing: {
    jobType: JobType; sizeBand: SizeBand;
    margins: { minimumPct: number; competitivePct: number; targetPct: number };
    prices: { minimumCents: number; competitiveCents: number; targetCents: number };
    selectedTier: "minimum" | "competitive" | "target" | "manual";
    manualPriceCents?: number | null;
    sellingPriceCents: number;
    realizedMarginPct: number;
    grossProfitCents: number;
  };
  warnings: EngineWarning[];
  assumptions: string[];
}
