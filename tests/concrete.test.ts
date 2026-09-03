import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { calculateConcrete } from "../src/services/concreteService";
import { testSettings, testInput } from "./fixtures";

const supply = testInput().concreteSupply!;

describe("concrete", () => {
  test("a small pour is hand-mixed from bags", () => {
    // 20 cu ft + 10% waste = 22 cu ft = 0.81 cu yd, under the 1.5 cu yd threshold.
    const result = calculateConcrete(20, testSettings(), supply);
    assert.equal(result.method, "bagged");
    // 22 cu ft at 0.6 cu ft per 80 lb bag = 36.67, rounded up because you cannot buy most of a bag.
    assert.equal(result.bagCount, 37);
    assert.equal(result.materialCents, 37 * 625);
    assert.ok(result.explanation.includes("hand-mix"));
  });

  test("a large pour switches to a ready-mix truck", () => {
    const result = calculateConcrete(40.6, testSettings(), supply);
    assert.equal(result.method, "ready_mix");
    // 40.6 + 10% = 44.66 cu ft = 1.654 cu yd.
    assert.equal(result.orderedCuYd, 1.654);
    assert.equal(result.deliveryCents, 15_000);
    assert.equal(result.materialCents, Math.round(1.654 * 18_500));
  });

  test("hand-mixing costs far more labor per yard than placing from a truck", () => {
    const bagged = calculateConcrete(20, testSettings(), supply);
    const ready = calculateConcrete(60, testSettings(), supply);
    const baggedPerYd = bagged.laborHours / bagged.orderedCuYd;
    const readyPerYd = ready.laborHours / ready.orderedCuYd;
    assert.ok(baggedPerYd > readyPerYd * 3, "hand mixing should be several times slower per yard");
  });

  test("waste is added before the yardage is worked out", () => {
    const noWaste = calculateConcrete(27, testSettings({ concrete: { ...testSettings().concrete, wasteFactorPct: 0 } }), supply);
    const withWaste = calculateConcrete(27, testSettings(), supply);
    assert.equal(noWaste.orderedCuFt, 27);
    assert.equal(withWaste.orderedCuFt, 29.7);
  });

  test("the plant minimum load is billed even when less is needed", () => {
    const settings = testSettings({ concrete: { ...testSettings().concrete, baggedMaxCuYd: 0 } });
    const result = calculateConcrete(10, settings, {
      readyMix: { name: "Ready-mix", perCuYdCents: 18_500, deliveryCents: 0, minimumCuYd: 3 },
    });
    assert.equal(result.orderedCuYd, 3);
    assert.ok(result.explanation.includes("plant minimum"));
  });

  test("no concrete price on file is reported, not silently priced at zero", () => {
    const result = calculateConcrete(40, testSettings(), {});
    assert.equal(result.method, "none");
    assert.equal(result.totalMaterialCents, 0);
    assert.ok(result.explanation.includes("No ready-mix"));
  });

  test("nothing in scope costs nothing", () => {
    const result = calculateConcrete(0, testSettings(), supply);
    assert.equal(result.method, "none");
    assert.equal(result.laborHours, 0);
  });
});
