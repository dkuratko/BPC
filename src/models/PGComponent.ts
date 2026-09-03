import { Schema, Types } from "mongoose";
import { defineModel, baseOptions } from "@/lib/defineModel";
import { UNITS, type Unit } from "@/lib/units";

import { COMPONENT_CATEGORIES, LABOR_SOURCES, type ComponentCategory, type LaborSource } from "@/lib/enums";
export { COMPONENT_CATEGORIES, LABOR_SOURCES };
export type { ComponentCategory, LaborSource };

/**
 * Where a component's install hours came from. Anything not "manual" or
 * "actuals" is a guess, and the estimate says so on the line item.
 */

export interface PGComponentDoc {
  _id: Types.ObjectId;
  manufacturerId: Types.ObjectId;
  partNumber: string;
  name: string;
  category?: ComponentCategory;
  subcategory?: string;
  description?: string;
  weightLb?: number;
  installation: {
    baseLaborHours?: number;
    laborSource: LaborSource;
    /** True once these hours have been checked against a real job. */
    verified: boolean;
    /** How many completed jobs have contributed to this number. */
    dataPoints: number;
    crewSize?: number;
    footingCount?: number;
    concreteCuFt?: number;
    /** Multiplier for fiddly parts: 1.0 normal, 1.5 for a roof at height. */
    complexity: number;
  };
  requirements: {
    specialtyTools: Array<{ name: string; quantity?: number; note?: string }>;
    equipment: Array<{
      equipmentId: Types.ObjectId; quantity: number;
      hours?: number; days?: number; required: boolean; note?: string;
    }>;
  };
  materialRequirements: Array<{ materialId: Types.ObjectId; quantity: number; unit: Unit; note?: string }>;
  /**
   * Reference only. Build Play installs; it does not resell the structure, so
   * this never enters a cost or a selling price. Kept because manufacturer
   * quotes carry it and it is a useful sanity check when parsing one.
   */
  manufacturerListPriceCents?: number | null;
  tags: string[];
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PGComponentSchema = new Schema(
  {
    manufacturerId: { type: Schema.Types.ObjectId, ref: "Manufacturer", required: true, index: true },
    partNumber: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: COMPONENT_CATEGORIES, index: true },
    subcategory: String,
    description: String,
    weightLb: Number,
    installation: {
      baseLaborHours: Number,
      laborSource: { type: String, enum: LABOR_SOURCES, default: "inferred_weight" },
      verified: { type: Boolean, default: false },
      dataPoints: { type: Number, default: 0 },
      crewSize: Number,
      footingCount: Number,
      concreteCuFt: Number,
      complexity: { type: Number, default: 1.0 },
    },
    requirements: {
      specialtyTools: {
        type: [new Schema({ name: String, quantity: Number, note: String }, { _id: false })],
        default: [],
      },
      equipment: {
        type: [
          new Schema(
            {
              equipmentId: { type: Schema.Types.ObjectId, ref: "Equipment", required: true },
              quantity: { type: Number, default: 1 },
              hours: Number,
              days: Number,
              required: { type: Boolean, default: true },
              note: String,
            },
            { _id: false },
          ),
        ],
        default: [],
      },
    },
    materialRequirements: {
      type: [
        new Schema(
          {
            materialId: { type: Schema.Types.ObjectId, ref: "Material", required: true },
            quantity: { type: Number, required: true },
            unit: { type: String, enum: UNITS, required: true },
            note: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    manufacturerListPriceCents: { type: Number, default: null },
    tags: { type: [String], default: [] },
    notes: String,
    active: { type: Boolean, default: true },
  },
  baseOptions,
);

// The same part number can exist at two manufacturers; it must be unique within one.
PGComponentSchema.index({ manufacturerId: 1, partNumber: 1 }, { unique: true });
PGComponentSchema.index({ name: "text", partNumber: "text", description: "text" });

export const PGComponent = defineModel<PGComponentDoc>("PGComponent", PGComponentSchema);
