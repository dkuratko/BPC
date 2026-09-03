import { Schema, Types } from "mongoose";
import { defineModel, baseOptions } from "@/lib/defineModel";

import { FACTOR_TARGETS, FACTOR_TARGET_LABELS, type FactorTarget } from "@/lib/enums";
export { FACTOR_TARGETS, FACTOR_TARGET_LABELS };
export type { FactorTarget };

/**
 * A tunable site condition, scored on a scale rather than a checkbox.
 *
 * "Difficult access" as a yes/no cannot tell the difference between parking
 * thirty feet away and wheelbarrowing engineered wood fibre four hundred feet
 * around a building. So each condition is rated (1 = ideal, 5 = standard,
 * 10 = worst case) and that rating drives a multiplier on the specific cost
 * categories it actually affects -- distance punishes surfacing labor far
 * harder than it punishes bolting a deck together.
 */

export interface FactorImpact {
  target: FactorTarget;
  /** Linear model: each point away from baseline moves the cost by this percent. */
  percentPerPoint: number;
  /** Optional explicit curve; when present it overrides the linear model. */
  curve?: Array<{ rating: number; multiplier: number }>;
}

export interface SiteFactorDoc {
  _id: Types.ObjectId;
  key: string;
  label: string;
  description?: string;
  scale: { min: number; max: number; baseline: number };
  ratingLabels: Array<{ rating: number; label: string }>;
  impacts: FactorImpact[];
  sortOrder: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SiteFactorSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    label: { type: String, required: true },
    description: String,
    scale: {
      min: { type: Number, default: 1 },
      max: { type: Number, default: 10 },
      /** The rating that means "normal". At baseline the multiplier is 1.0. */
      baseline: { type: Number, default: 5 },
    },
    ratingLabels: {
      type: [new Schema({ rating: Number, label: String }, { _id: false })],
      default: [],
    },
    impacts: {
      type: [
        new Schema(
          {
            target: { type: String, enum: FACTOR_TARGETS, required: true },
            percentPerPoint: { type: Number, required: true, default: 0 },
            curve: {
              type: [new Schema({ rating: Number, multiplier: Number }, { _id: false })],
              default: undefined,
            },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    sortOrder: { type: Number, default: 100 },
    active: { type: Boolean, default: true },
  },
  baseOptions,
);

export const SiteFactor = defineModel<SiteFactorDoc>("SiteFactor", SiteFactorSchema);
