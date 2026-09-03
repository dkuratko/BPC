import { Schema, Types } from "mongoose";
import { defineModel, baseOptions, effectiveDating } from "@/lib/defineModel";

import { LABOR_TYPES, type LaborType } from "@/lib/enums";
export { LABOR_TYPES };
export type { LaborType };

/**
 * The cost of an hour of work, fully burdened.
 *
 * Base wage alone understates labor by a third or more once payroll taxes,
 * workers comp (expensive in construction), and benefits are counted. The
 * burden percentages are stored alongside the result so an estimate can show
 * how the rate was built, and so a raise or a comp-rate change is a new row
 * rather than a silent edit to old quotes.
 */
export interface LaborRateDoc {
  _id: Types.ObjectId;
  name: string;
  type: LaborType;
  crewSize: number;
  /** For crews: the roles that make up the crew, purely descriptive. */
  composition?: string;
  baseWageCents: number;
  burden: {
    payrollTaxPct: number; workersCompPct: number; benefitsPct: number;
    otherPct: number; overheadAllocationPct: number;
  };
  /** Computed on save from baseWageCents + burden. Per PERSON per hour. */
  fullyBurdenedCents: number;
  /** fullyBurdenedCents x crewSize. Per CREW hour. */
  crewHourlyCents: number;
  isDefault: boolean;
  effectiveDate: Date;
  expirationDate?: Date | null;
  active: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LaborRateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    type: { type: String, enum: LABOR_TYPES, required: true, default: "crew" },
    crewSize: { type: Number, required: true, default: 1, min: 1 },
    composition: String,
    baseWageCents: { type: Number, required: true },
    burden: {
      payrollTaxPct: { type: Number, default: 9.5 },
      workersCompPct: { type: Number, default: 10 },
      benefitsPct: { type: Number, default: 5 },
      otherPct: { type: Number, default: 2 },
      overheadAllocationPct: { type: Number, default: 0 },
    },
    fullyBurdenedCents: { type: Number, required: true, default: 0 },
    crewHourlyCents: { type: Number, required: true, default: 0 },
    isDefault: { type: Boolean, default: false },
    ...effectiveDating,
    active: { type: Boolean, default: true },
    notes: String,
  },
  baseOptions,
);

/** Keep the derived rate in step with its inputs on every write. */
LaborRateSchema.pre("validate", function (next) {
  const doc = this as unknown as LaborRateDoc;
  const b = doc.burden ?? ({} as LaborRateDoc["burden"]);
  const totalPct =
    (b.payrollTaxPct ?? 0) + (b.workersCompPct ?? 0) + (b.benefitsPct ?? 0) +
    (b.otherPct ?? 0) + (b.overheadAllocationPct ?? 0);
  doc.fullyBurdenedCents = Math.round((doc.baseWageCents ?? 0) * (1 + totalPct / 100));
  doc.crewHourlyCents = doc.fullyBurdenedCents * (doc.crewSize ?? 1);
  next();
});

export const LaborRate = defineModel<LaborRateDoc>("LaborRate", LaborRateSchema);
