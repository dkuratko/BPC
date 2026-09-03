import { Schema, Types } from "mongoose";
import { defineModel, baseOptions } from "@/lib/defineModel";

/**
 * A preset playground: a bill of materials that explodes into components.
 * The manufacturer summary (their published hours, footings, concrete, weight)
 * is kept as given -- it is the baseline the engine multiplies, and it should
 * not be quietly overwritten by our own rolled-up numbers.
 */
export interface PGAssemblyDoc {
  _id: Types.ObjectId;
  manufacturerId: Types.ObjectId;
  modelNumber: string;
  name: string;
  ageRange?: string;
  components: Array<{ componentId: Types.ObjectId; quantity: number; note?: string }>;
  manufacturerSummary: {
    laborHours?: number;
    footingCount?: number;
    concreteCuFt?: number;
    totalWeightLb?: number;
    safetyZoneSqFt?: number;
  };
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PGAssemblySchema = new Schema(
  {
    manufacturerId: { type: Schema.Types.ObjectId, ref: "Manufacturer", required: true, index: true },
    modelNumber: { type: String, required: true, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    ageRange: String,
    components: {
      type: [
        new Schema(
          {
            componentId: { type: Schema.Types.ObjectId, ref: "PGComponent", required: true },
            quantity: { type: Number, required: true, min: 1 },
            note: String,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    manufacturerSummary: {
      laborHours: Number,
      footingCount: Number,
      concreteCuFt: Number,
      totalWeightLb: Number,
      safetyZoneSqFt: Number,
    },
    notes: String,
    active: { type: Boolean, default: true },
  },
  baseOptions,
);

PGAssemblySchema.index({ manufacturerId: 1, modelNumber: 1 }, { unique: true });

export const PGAssembly = defineModel<PGAssemblyDoc>("PGAssembly", PGAssemblySchema);
