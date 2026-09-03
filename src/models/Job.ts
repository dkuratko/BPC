import { Schema, Types } from "mongoose";
import { defineModel, baseOptions } from "@/lib/defineModel";

/**
 * What actually happened. This is the feedback loop: estimated 43.3 hours
 * against an actual 51 is worth more than knowing the job made money, because
 * it tells you which assumption was wrong.
 *
 * Phase 6 in the build order -- the model and the variance maths exist now so
 * actuals can start being collected from the first job rather than being
 * back-filled later from memory.
 */
export interface JobDoc {
  _id: Types.ObjectId;
  projectId: Types.ObjectId;
  estimateId?: Types.ObjectId | null;
  status: "scheduled" | "in_progress" | "complete" | "cancelled";
  startedAt?: Date | null;
  completedAt?: Date | null;
  crewDays?: number;
  actuals: {
    labor: { hours?: number; costCents?: number };
    materials: Array<{ materialId?: Types.ObjectId | null; description?: string; quantity?: number; unit?: string; costCents?: number }>;
    equipment: Array<{ equipmentId?: Types.ObjectId | null; description?: string; hours?: number; days?: number; costCents?: number }>;
    rentals: Array<{ equipmentId?: Types.ObjectId | null; vendorId?: Types.ObjectId | null; description?: string; days?: number; costCents?: number }>;
    subcontractorCostCents?: number;
    mobilizationCostCents?: number;
    otherCostCents?: number;
    concreteCuYd?: number;
    footingCount?: number;
  };
  financials: {
    revenueCents?: number;
    totalCostCents?: number;
    grossProfitCents?: number;
    grossMarginPct?: number;
  };
  /** Computed by varianceService from the estimate snapshot vs the actuals. */
  variance: Record<string, { estimated: number; actual: number; difference: number; percent: number }>;
  lessons?: string;
  notes?: string;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    estimateId: { type: Schema.Types.ObjectId, ref: "Estimate", default: null, index: true },
    status: {
      type: String,
      enum: ["scheduled", "in_progress", "complete", "cancelled"],
      default: "scheduled",
      index: true,
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    crewDays: Number,
    actuals: {
      labor: { hours: Number, costCents: Number },
      materials: { type: [Schema.Types.Mixed], default: [] },
      equipment: { type: [Schema.Types.Mixed], default: [] },
      rentals: { type: [Schema.Types.Mixed], default: [] },
      subcontractorCostCents: { type: Number, default: 0 },
      mobilizationCostCents: { type: Number, default: 0 },
      otherCostCents: { type: Number, default: 0 },
      concreteCuYd: Number,
      footingCount: Number,
    },
    financials: {
      revenueCents: Number,
      totalCostCents: Number,
      grossProfitCents: Number,
      grossMarginPct: Number,
    },
    variance: { type: Schema.Types.Mixed, default: {} },
    lessons: String,
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  baseOptions,
);

export const Job = defineModel<JobDoc>("Job", JobSchema);
