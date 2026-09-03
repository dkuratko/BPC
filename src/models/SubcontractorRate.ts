import { Schema, Types } from "mongoose";
import { defineModel, baseOptions, effectiveDating } from "@/lib/defineModel";
import { UNITS, type Unit } from "@/lib/units";

/**
 * Subcontracted work priced by the unit rather than as a lump sum, so a bid
 * that changes size does not need a fresh phone call to the sub.
 */
export interface SubcontractorRateDoc {
  _id: Types.ObjectId;
  vendorId: Types.ObjectId;
  service: string;
  category: string;
  unit: Unit;
  unitCostCents: number;
  minimumChargeCents: number;
  mobilizationCents: number;
  /** What Build Play adds on top of the sub's price when selling it. */
  markupPct: number;
  scopeNotes?: string;
  effectiveDate: Date;
  expirationDate?: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SubcontractorRateSchema = new Schema(
  {
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    service: { type: String, required: true, trim: true, index: true },
    category: {
      type: String,
      enum: ["surfacing", "concrete", "demolition", "excavation", "fencing", "shade", "electrical", "other"],
      default: "other",
    },
    unit: { type: String, enum: UNITS, required: true },
    unitCostCents: { type: Number, required: true },
    minimumChargeCents: { type: Number, default: 0 },
    mobilizationCents: { type: Number, default: 0 },
    markupPct: { type: Number, default: 0 },
    scopeNotes: String,
    ...effectiveDating,
    active: { type: Boolean, default: true },
  },
  baseOptions,
);

SubcontractorRateSchema.index({ vendorId: 1, service: 1, effectiveDate: -1 });

export const SubcontractorRate = defineModel<SubcontractorRateDoc>("SubcontractorRate", SubcontractorRateSchema);
