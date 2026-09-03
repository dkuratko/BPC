import { Schema, Types } from "mongoose";
import { defineModel, baseOptions, effectiveDating } from "@/lib/defineModel";
import { UNITS, type Unit } from "@/lib/units";

import { MATERIAL_CATEGORIES, CONCRETE_ROLES, type MaterialCategory, type ConcreteRole } from "@/lib/enums";
export { MATERIAL_CATEGORIES, CONCRETE_ROLES };
export type { MaterialCategory, ConcreteRole };

/**
 * Concrete comes two ways and the estimate has to say which: bags mixed on site
 * for a handful of footings, or a ready-mix truck once the pour is big enough
 * to be worth the delivery. Tagging the role lets the engine choose.
 */

export interface PricingOption {
  unit: Unit;
  unitCostCents: number;
  /** Install labor for one unit of this material, if it carries its own labor. */
  laborHoursPerUnit?: number;
  /** Fixed charge added once when this option is used (delivery, short load). */
  fixedFeeCents?: number;
  /** Below this quantity the fixed fee or a minimum charge applies. */
  minimumQuantity?: number;
  minimumChargeCents?: number;
  note?: string;
}

export interface MaterialDoc {
  _id: Types.ObjectId;
  name: string;
  category: MaterialCategory;
  /**
   * Surfacing in particular is bought and sold three different ways: by the
   * cubic yard delivered, by the square foot installed at a depth, and by the
   * ton (usually when hauling the old stuff out). Each way carries its own
   * price and its own labor, so a material holds several pricing options and
   * the estimate line picks one.
   */
  pricingOptions: PricingOption[];
  defaultUnit: Unit;
  concreteRole?: ConcreteRole | null;
  /** Bagged concrete only: what size bag the price refers to. */
  bagWeightLb?: number;
  specifications: { strength?: string; slump?: string; thickness?: string; depthIn?: number; notes?: string };
  /** Extra ordered to cover spillage, cut-off and over-excavation. */
  wasteFactorPct: number;
  taxable: boolean;
  preferredVendorId?: Types.ObjectId | null;
  effectiveDate: Date;
  expirationDate?: Date | null;
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PricingOptionSchema = new Schema(
  {
    unit: { type: String, enum: UNITS, required: true },
    unitCostCents: { type: Number, required: true },
    laborHoursPerUnit: { type: Number, default: 0 },
    fixedFeeCents: { type: Number, default: 0 },
    minimumQuantity: { type: Number, default: 0 },
    minimumChargeCents: { type: Number, default: 0 },
    note: String,
  },
  { _id: false },
);

const MaterialSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    category: { type: String, enum: MATERIAL_CATEGORIES, required: true, index: true },
    pricingOptions: {
      type: [PricingOptionSchema],
      required: true,
      validate: {
        validator: (v: PricingOption[]) => Array.isArray(v) && v.length > 0,
        message: "A material needs at least one pricing option",
      },
    },
    defaultUnit: { type: String, enum: UNITS, required: true },
    concreteRole: { type: String, enum: [...CONCRETE_ROLES, null], default: null },
    bagWeightLb: Number,
    specifications: { strength: String, slump: String, thickness: String, depthIn: Number, notes: String },
    wasteFactorPct: { type: Number, default: 0 },
    taxable: { type: Boolean, default: true },
    preferredVendorId: { type: Schema.Types.ObjectId, ref: "Vendor", default: null },
    ...effectiveDating,
    notes: String,
    active: { type: Boolean, default: true },
  },
  baseOptions,
);

MaterialSchema.index({ name: 1, effectiveDate: -1 });

export const Material = defineModel<MaterialDoc>("Material", MaterialSchema);
