import { Schema, Types } from "mongoose";
import { defineModel, baseOptions } from "@/lib/defineModel";

import { EQUIPMENT_TYPES, OWNERSHIP, type EquipmentType, type Ownership } from "@/lib/enums";
export { EQUIPMENT_TYPES, OWNERSHIP };
export type { EquipmentType, Ownership };

export interface EquipmentDoc {
  _id: Types.ObjectId;
  name: string;
  type: EquipmentType;
  ownership: Ownership;
  makeModel?: string;
  year?: number;
  specifications: {
    capacityLb?: number; maxReachFt?: number; maxLiftHeightFt?: number;
    bucketSize?: number; weightLb?: number; notes?: string;
  };
  /**
   * What an owned machine costs the job per hour/day. Owned iron is not free:
   * this covers depreciation, maintenance, tyres/tracks and insurance so that
   * using the T66 shows up as a real cost against the job.
   */
  internalRate: { hourlyCents?: number; dailyCents?: number; note?: string };
  fuel: { type?: string; gallonsPerHour?: number; gallonsPerDay?: number };
  /** Hauled on the trailer -- feeds the mobilization weight calculation. */
  transportWeightLb?: number;
  requiresOperatorCertification: boolean;
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EquipmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    type: { type: String, enum: EQUIPMENT_TYPES, required: true, index: true },
    ownership: { type: String, enum: OWNERSHIP, required: true, default: "rented" },
    makeModel: String,
    year: Number,
    specifications: {
      capacityLb: Number,
      maxReachFt: Number,
      maxLiftHeightFt: Number,
      bucketSize: Number,
      weightLb: Number,
      notes: String,
    },
    internalRate: { hourlyCents: Number, dailyCents: Number, note: String },
    fuel: { type: { type: String }, gallonsPerHour: Number, gallonsPerDay: Number },
    transportWeightLb: Number,
    requiresOperatorCertification: { type: Boolean, default: false },
    notes: String,
    active: { type: Boolean, default: true },
  },
  baseOptions,
);

EquipmentSchema.index({ name: 1, makeModel: 1 }, { unique: true });

export const Equipment = defineModel<EquipmentDoc>("Equipment", EquipmentSchema);
