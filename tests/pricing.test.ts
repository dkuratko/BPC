import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { calculatePricing, classifySizeBand, marginToMarkup, resolveMargins } from "../src/services/pricingService";
import { testSettings } from "./fixtures";

describe("pricing", () => {
  test("quotes three prices off one cost", () => {
    const result = calculatePricing(100_000, 90_000, "school_district", testSettings());
    assert.equal(result.prices.minimumCents, Math.round(100_000 / 0.7));
    assert.equal(result.prices.competitiveCents, Math.round(100_000 / 0.67));
    assert.equal(result.prices.targetCents, Math.round(100_000 / 0.62));
    assert.ok(result.prices.minimumCents < result.prices.competitiveCents);
    assert.ok(result.prices.competitiveCents < result.prices.targetCents);
  });

  test("target is the default selection", () => {
    const result = calculatePricing(100_000, 90_000, "other", testSettings());
    assert.equal(result.selectedTier, "target");
    assert.equal(result.sellingPriceCents, result.prices.targetCents);
  });

  test("a hand-set price below the floor is allowed but flagged", () => {
    const result = calculatePricing(100_000, 90_000, "other", testSettings(), {
      selectedTier: "manual",
      manualPriceCents: 120_000,
    });
    assert.equal(result.sellingPriceCents, 120_000);
    assert.ok(result.realizedMarginPct < 30);
    assert.equal(result.belowFloor, true);
  });

  test("size bands come from direct cost", () => {
    const settings = testSettings();
    assert.equal(classifySizeBand(500_000, settings), "small");
    assert.equal(classifySizeBand(3_000_000, settings), "medium");
    assert.equal(classifySizeBand(9_000_000, settings), "large");
  });

  test("a job-type preset beats the default margins", () => {
    const settings = testSettings();
    settings.pricing.marginPresets = [
      { jobType: "residential", sizeBand: "small", margins: { minimumPct: 32, competitivePct: 38, targetPct: 45 } },
    ];
    assert.equal(resolveMargins("residential", "small", settings).targetPct, 45);
    // No preset for this combination: fall back to the defaults rather than guessing.
    assert.equal(resolveMargins("residential", "large", settings).targetPct, 38);
    assert.equal(resolveMargins("commercial", "small", settings).targetPct, 38);
  });

  test("margin converts to the markup it is equivalent to", () => {
    assert.equal(marginToMarkup(30), 42.86);
    assert.equal(marginToMarkup(50), 100);
  });
});
