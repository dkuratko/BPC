import { Schema, Types } from "mongoose";
import { defineModel, baseOptions } from "@/lib/defineModel";
import { JOB_TYPES, SIZE_BANDS, type JobType, type SizeBand } from "./Settings";

import { ESTIMATE_STATUSES, PRICE_TIERS, LOCKED_STATUSES, type EstimateStatus, type PriceTier } from "@/lib/enums";
export { ESTIMATE_STATUSES, PRICE_TIERS, LOCKED_STATUSES };
export type { EstimateStatus, PriceTier };

/**
 * A versioned calculation for one project.
 *
 * Everything the calculation depended on is copied in here at the moment it was
 * run -- labor rate, rental rates, material prices, site multipliers, margins,
 * overhead. Raising your labor rate next month must not silently restate the
 * price you already put in front of a customer.
 */
export interface EstimateDoc {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  estimateNumber: string;
  version: number;
  status: EstimateStatus;
  supersedesId?: Types.ObjectId | null;
  sourceDocumentIds: Types.ObjectId[];

  playgroundSnapshot: {
    sourceType: "custom" | "preset" | "unknown";
    modelDescription?: string;
    ageRange?: string;
    assemblyId?: Types.ObjectId | null;
    totalWeightLb: number;
    footingCount: number;
    concreteCuFt: number;
    manufacturerLaborHours: number;
    safetyZoneSqFt: number;
    components: Array<{
      componentId?: Types.ObjectId | null;
      partNumber?: string;
      name: string;
      quantity: number;
      weightLb?: number;
      laborHours: number;
      laborSource: string;
      verified: boolean;
      footingCount?: number;
      concreteCuFt?: number;
    }>;
  };

  /** Every rate and setting the engine read, frozen. */
  inputSnapshot: {
    calculatedAt?: Date;
    engineVersion: string;
    laborRate?: {
      laborRateId?: Types.ObjectId | null; name?: string; crewSize?: number;
      fullyBurdenedCents?: number; crewHourlyCents?: number;
    };
    settings?: Record<string, unknown>;
    siteRatings: Array<{
      factorKey: string; label: string; rating: number; baseline: number;
      impacts: Array<{ target: string; multiplier: number }>;
      note?: string;
    }>;
    siteMultipliers: Record<string, number>;
  };

  /** What the engine decided the job needs, before it was costed. */
  requirements: {
    laborHours: {
      componentInstall: number; concrete: number; surfacing: number;
      excavation: number; demolition: number; other: number; total: number;
      /** Total after site multipliers are applied. */
      adjustedTotal: number;
    };
    crewDays: number;
    equipment: Array<{ equipmentId?: Types.ObjectId | null; name: string; hours?: number; days?: number; owned: boolean; reason?: string }>;
    rentals: Array<{ equipmentId?: Types.ObjectId | null; name: string; days: number; vendorName?: string; reason?: string }>;
    specialtyTools: string[];
  };

  totals: {
    laborCostCents: number;
    materialCostCents: number;
    materialTaxCents: number;
    consumablesCostCents: number;
    equipmentCostCents: number;
    rentalCostCents: number;
    subcontractorCostCents: number;
    mobilizationCostCents: number;
    otherCostCents: number;
    directCostCents: number;
    overheadCostCents: number;
    contingencyCostCents: number;
    totalCostCents: number;
  };

  pricing: {
    jobType: JobType;
    sizeBand: SizeBand;
    margins: { minimumPct: number; competitivePct: number; targetPct: number };
    prices: { minimumCents: number; competitiveCents: number; targetCents: number };
    selectedTier: PriceTier;
    manualPriceCents?: number | null;
    sellingPriceCents: number;
    realizedMarginPct: number;
    grossProfitCents: number;
  };

  /**
   * The estimator's choices -- which components, how many rental days, which
   * crew -- kept so a revision can be recalculated from the same recipe against
   * fresh rates, instead of being retyped.
   */
  recipe: Record<string, unknown>;

  assumptions: string[];
  exclusions: string[];
  /** Things the estimator should look at: inferred hours, missing rates, stale prices. */
  warnings: Array<{ level: "info" | "warning" | "error"; message: string; ref?: string }>;
  notes?: string;

  sentAt?: Date | null;
  decidedAt?: Date | null;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const EstimateSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    estimateNumber: { type: String, required: true, unique: true, index: true },
    version: { type: Number, default: 1 },
    status: { type: String, enum: ESTIMATE_STATUSES, default: "draft", index: true },
    supersedesId: { type: Schema.Types.ObjectId, ref: "Estimate", default: null },
    sourceDocumentIds: [{ type: Schema.Types.ObjectId, ref: "SourceDocument" }],

    playgroundSnapshot: {
      sourceType: { type: String, enum: ["custom", "preset", "unknown"], default: "unknown" },
      modelDescription: String,
      ageRange: String,
      assemblyId: { type: Schema.Types.ObjectId, ref: "PGAssembly", default: null },
      totalWeightLb: { type: Number, default: 0 },
      footingCount: { type: Number, default: 0 },
      concreteCuFt: { type: Number, default: 0 },
      manufacturerLaborHours: { type: Number, default: 0 },
      safetyZoneSqFt: { type: Number, default: 0 },
      components: { type: [Schema.Types.Mixed], default: [] },
    },

    inputSnapshot: {
      calculatedAt: Date,
      engineVersion: { type: String, default: "0" },
      laborRate: { type: Schema.Types.Mixed, default: {} },
      settings: { type: Schema.Types.Mixed, default: {} },
      siteRatings: { type: [Schema.Types.Mixed], default: [] },
      siteMultipliers: { type: Schema.Types.Mixed, default: {} },
    },

    requirements: {
      laborHours: {
        componentInstall: { type: Number, default: 0 },
        concrete: { type: Number, default: 0 },
        surfacing: { type: Number, default: 0 },
        excavation: { type: Number, default: 0 },
        demolition: { type: Number, default: 0 },
        other: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        adjustedTotal: { type: Number, default: 0 },
      },
      crewDays: { type: Number, default: 0 },
      equipment: { type: [Schema.Types.Mixed], default: [] },
      rentals: { type: [Schema.Types.Mixed], default: [] },
      specialtyTools: { type: [String], default: [] },
    },

    totals: {
      laborCostCents: { type: Number, default: 0 },
      materialCostCents: { type: Number, default: 0 },
      materialTaxCents: { type: Number, default: 0 },
      consumablesCostCents: { type: Number, default: 0 },
      equipmentCostCents: { type: Number, default: 0 },
      rentalCostCents: { type: Number, default: 0 },
      subcontractorCostCents: { type: Number, default: 0 },
      mobilizationCostCents: { type: Number, default: 0 },
      otherCostCents: { type: Number, default: 0 },
      directCostCents: { type: Number, default: 0 },
      overheadCostCents: { type: Number, default: 0 },
      contingencyCostCents: { type: Number, default: 0 },
      totalCostCents: { type: Number, default: 0 },
    },

    pricing: {
      jobType: { type: String, enum: JOB_TYPES, default: "other" },
      sizeBand: { type: String, enum: SIZE_BANDS, default: "small" },
      margins: {
        minimumPct: { type: Number, default: 30 },
        competitivePct: { type: Number, default: 33 },
        targetPct: { type: Number, default: 38 },
      },
      prices: {
        minimumCents: { type: Number, default: 0 },
        competitiveCents: { type: Number, default: 0 },
        targetCents: { type: Number, default: 0 },
      },
      selectedTier: { type: String, enum: PRICE_TIERS, default: "target" },
      manualPriceCents: { type: Number, default: null },
      sellingPriceCents: { type: Number, default: 0 },
      realizedMarginPct: { type: Number, default: 0 },
      grossProfitCents: { type: Number, default: 0 },
    },

    recipe: { type: Schema.Types.Mixed, default: {} },
    assumptions: { type: [String], default: [] },
    exclusions: { type: [String], default: [] },
    warnings: { type: [Schema.Types.Mixed], default: [] },
    notes: String,

    sentAt: { type: Date, default: null },
    decidedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  baseOptions,
);

EstimateSchema.index({ projectId: 1, version: -1 });

export const Estimate = defineModel<EstimateDoc>("Estimate", EstimateSchema);
