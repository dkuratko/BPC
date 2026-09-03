import type { RuleCondition, RuleOperator } from "@/models/EstimatingRule";

/**
 * Condition evaluation for estimatingRules.
 *
 * Phase 4 of the build order. The evaluator is here now so rules can be written
 * and tested against real estimates before they are allowed to move money; the
 * engine consumes only the rule types listed in IMPLEMENTED_RULE_TYPES.
 *
 * Rules decide requirements, never prices: "if a roof exists, a telehandler is
 * required" is a rule; what a telehandler costs today is a RentalRate.
 */

export const IMPLEMENTED_RULE_TYPES = ["equipmentRequirement", "laborRequirement", "materialRequirement"] as const;

/** Read a dotted path out of the evaluation context. */
export function resolveField(context: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, context);
}

export function evaluateCondition(context: Record<string, unknown>, condition: RuleCondition): boolean {
  const actual = resolveField(context, condition.field);
  const expected = condition.value;

  const compare: Record<RuleOperator, () => boolean> = {
    equals: () => actual === expected,
    notEquals: () => actual !== expected,
    gt: () => Number(actual) > Number(expected),
    gte: () => Number(actual) >= Number(expected),
    lt: () => Number(actual) < Number(expected),
    lte: () => Number(actual) <= Number(expected),
    contains: () =>
      Array.isArray(actual)
        ? actual.includes(expected)
        : typeof actual === "string" && typeof expected === "string"
          ? actual.toLowerCase().includes(expected.toLowerCase())
          : false,
    in: () => Array.isArray(expected) && expected.includes(actual),
    exists: () => (expected === false ? actual === undefined || actual === null : actual !== undefined && actual !== null),
  };

  const fn = compare[condition.operator];
  return fn ? fn() : false;
}

/** All conditions must hold. An empty condition list always fires. */
export function ruleMatches(context: Record<string, unknown>, conditions: RuleCondition[]): boolean {
  return conditions.every((c) => evaluateCondition(context, c));
}

export interface RuleLike {
  id?: string;
  name: string;
  type: string;
  conditions: RuleCondition[];
  action: Record<string, unknown>;
  priority: number;
  effectiveDate?: Date;
  expirationDate?: Date | null;
  active?: boolean;
}

export function activeRulesOn(rules: RuleLike[], when: Date): RuleLike[] {
  return rules
    .filter((r) => r.active !== false)
    .filter((r) => !r.effectiveDate || r.effectiveDate <= when)
    .filter((r) => !r.expirationDate || r.expirationDate >= when)
    .sort((a, b) => a.priority - b.priority);
}

export interface MatchedRule {
  rule: RuleLike;
  matched: boolean;
}

/**
 * Evaluate every rule against the context and report which fired. Applying the
 * results is deliberately left to the caller so that a rule can be dry-run
 * against a live estimate without changing it.
 */
export function evaluateRules(rules: RuleLike[], context: Record<string, unknown>, when = new Date()): MatchedRule[] {
  return activeRulesOn(rules, when).map((rule) => ({ rule, matched: ruleMatches(context, rule.conditions) }));
}
