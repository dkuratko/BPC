import { Schema, Types } from "mongoose";
import { defineModel, baseOptions, effectiveDating } from "@/lib/defineModel";
import { UNITS, type Unit } from "@/lib/units";

import { RULE_TYPES, RULE_OPERATORS, type RuleType, type RuleOperator } from "@/lib/enums";
export { RULE_TYPES, RULE_OPERATORS };
export type { RuleType, RuleOperator };

/**
 * Conditional rules layered on top of the base calculation.
 *
 * Phase 4 territory: the model and the condition evaluator exist now so that
 * rules can be written and stored, but the engine currently applies only the
 * rule types marked as implemented in ruleEngine.ts. Rules never carry prices --
 * "if a roof exists, a telehandler is required" is a rule; what a telehandler
 * costs today is a RentalRate.
 */

export interface RuleCondition {
  field: string;
  operator: RuleOperator;
  value?: unknown;
}

export interface EstimatingRuleDoc {
  _id: Types.ObjectId;
  name: string;
  type: RuleType;
  description?: string;
  /** All conditions must hold for the rule to fire. */
  conditions: RuleCondition[];
  action: {
    formula?: string;
    multiplier?: number;
    target?: string;
    equipmentId?: Types.ObjectId | null;
    materialId?: Types.ObjectId | null;
    laborRateId?: Types.ObjectId | null;
    quantity?: number;
    unit?: Unit;
    durationDays?: number;
    hours?: number;
    valueCents?: number;
    value?: unknown;
  };
  priority: number;
  effectiveDate: Date;
  expirationDate?: Date | null;
  active: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EstimatingRuleSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, index: true },
    type: { type: String, enum: RULE_TYPES, required: true },
    description: String,
    conditions: {
      type: [
        new Schema(
          {
            field: { type: String, required: true },
            operator: { type: String, enum: RULE_OPERATORS, required: true },
            value: Schema.Types.Mixed,
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    action: {
      formula: String,
      multiplier: Number,
      target: String,
      equipmentId: { type: Schema.Types.ObjectId, ref: "Equipment", default: null },
      materialId: { type: Schema.Types.ObjectId, ref: "Material", default: null },
      laborRateId: { type: Schema.Types.ObjectId, ref: "LaborRate", default: null },
      quantity: Number,
      unit: { type: String, enum: UNITS },
      durationDays: Number,
      hours: Number,
      valueCents: Number,
      value: Schema.Types.Mixed,
    },
    /** Lower numbers evaluate first. */
    priority: { type: Number, default: 100 },
    ...effectiveDating,
    active: { type: Boolean, default: true },
    notes: String,
  },
  baseOptions,
);

export const EstimatingRule = defineModel<EstimatingRuleDoc>("EstimatingRule", EstimatingRuleSchema);
