import { Schema, Types } from "mongoose";
import { defineModel, baseOptions } from "@/lib/defineModel";
import { UNITS, type Unit } from "@/lib/units";

import { LINE_CATEGORIES, SOURCE_TYPES, LINE_CATEGORY_LABELS, type LineCategory, type SourceType } from "@/lib/enums";
export { LINE_CATEGORIES, SOURCE_TYPES, LINE_CATEGORY_LABELS };
export type { LineCategory, SourceType };

/**
 * One auditable row of the calculation.
 *
 * The point is that any number on the estimate can be clicked and explained:
 * a $1,025 telehandler line shows the daily rate, the day count, delivery,
 * pickup and fuel that produced it, and which vendor rate row it came from.
 */
export interface EstimateLineItemDoc {
  _id: Types.ObjectId;
  estimateId: Types.ObjectId;
  category: LineCategory;
  /** Ordering within a category, so the printed estimate reads sensibly. */
  sortOrder: number;
  description: string;
  quantity: number;
  unit: Unit;
  unitCostCents: number;
  costCents: number;
  /** True for rows the user typed rather than the engine produced. */
  manual: boolean;
  /** Customer-facing estimates hide internal-only rows. */
  internalOnly: boolean;
  source: {
    type?: SourceType;
    sourceId?: Types.ObjectId | null;
    ruleId?: Types.ObjectId | null;
    label?: string;
  };
  calculation: {
    inputs?: Record<string, unknown>;
    formula?: string;
    explanation?: string;
  };
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EstimateLineItemSchema = new Schema(
  {
    estimateId: { type: Schema.Types.ObjectId, ref: "Estimate", required: true, index: true },
    category: { type: String, enum: LINE_CATEGORIES, required: true, index: true },
    sortOrder: { type: Number, default: 100 },
    description: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    unit: { type: String, enum: UNITS, default: "each" },
    unitCostCents: { type: Number, default: 0 },
    costCents: { type: Number, required: true, default: 0 },
    manual: { type: Boolean, default: false },
    internalOnly: { type: Boolean, default: false },
    source: {
      type: { type: String, enum: SOURCE_TYPES, default: "manual" },
      sourceId: { type: Schema.Types.ObjectId, default: null },
      ruleId: { type: Schema.Types.ObjectId, ref: "EstimatingRule", default: null },
      label: String,
    },
    calculation: {
      inputs: { type: Schema.Types.Mixed, default: {} },
      formula: String,
      explanation: String,
    },
    notes: String,
  },
  baseOptions,
);

EstimateLineItemSchema.index({ estimateId: 1, category: 1, sortOrder: 1 });

export const EstimateLineItem = defineModel<EstimateLineItemDoc>("EstimateLineItem", EstimateLineItemSchema);
