import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { evaluateCondition, evaluateRules, resolveField, ruleMatches } from "../src/services/ruleEngine";

const context = {
  playground: { footingCount: 19, hasRoof: true, tags: ["roof", "deck"] },
  site: { access: "difficult" },
};

describe("rule engine", () => {
  test("dotted paths reach into the context", () => {
    assert.equal(resolveField(context, "playground.footingCount"), 19);
    assert.equal(resolveField(context, "playground.missing.deeper"), undefined);
  });

  test("comparison operators", () => {
    assert.equal(evaluateCondition(context, { field: "playground.footingCount", operator: "gt", value: 15 }), true);
    assert.equal(evaluateCondition(context, { field: "playground.footingCount", operator: "lt", value: 15 }), false);
    assert.equal(evaluateCondition(context, { field: "site.access", operator: "equals", value: "difficult" }), true);
    assert.equal(evaluateCondition(context, { field: "playground.tags", operator: "contains", value: "roof" }), true);
    assert.equal(evaluateCondition(context, { field: "site.access", operator: "in", value: ["easy", "difficult"] }), true);
    assert.equal(evaluateCondition(context, { field: "playground.hasRoof", operator: "exists", value: true }), true);
    assert.equal(evaluateCondition(context, { field: "playground.nothing", operator: "exists", value: true }), false);
  });

  test("all conditions must hold", () => {
    assert.equal(
      ruleMatches(context, [
        { field: "playground.hasRoof", operator: "equals", value: true },
        { field: "playground.footingCount", operator: "gte", value: 19 },
      ]),
      true,
    );
    assert.equal(
      ruleMatches(context, [
        { field: "playground.hasRoof", operator: "equals", value: true },
        { field: "playground.footingCount", operator: "gt", value: 50 },
      ]),
      false,
    );
  });

  test("rules outside their effective dates do not fire", () => {
    const rules = [
      {
        name: "expired", type: "equipmentRequirement", priority: 10, conditions: [], action: {},
        effectiveDate: new Date("2020-01-01"), expirationDate: new Date("2021-01-01"),
      },
      {
        name: "live", type: "equipmentRequirement", priority: 20, conditions: [], action: {},
        effectiveDate: new Date("2020-01-01"), expirationDate: null,
      },
    ];
    const evaluated = evaluateRules(rules, context, new Date("2026-06-01"));
    assert.equal(evaluated.length, 1);
    assert.equal(evaluated[0].rule.name, "live");
  });

  test("rules are evaluated in priority order", () => {
    const rules = [
      { name: "second", type: "multiplier", priority: 200, conditions: [], action: {} },
      { name: "first", type: "multiplier", priority: 10, conditions: [], action: {} },
    ];
    assert.deepEqual(evaluateRules(rules, context).map((r) => r.rule.name), ["first", "second"]);
  });
});
