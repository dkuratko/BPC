import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { computeSiteMultipliers, multiplierForRating } from "../src/services/siteFactorService";
import type { SiteFactorInput } from "../src/services/types";

const carryDistance: SiteFactorInput = {
  key: "carry_distance",
  label: "Carry distance",
  scale: { min: 1, max: 10, baseline: 5 },
  impacts: [
    { target: "install_labor", percentPerPoint: 3 },
    { target: "surfacing_labor", percentPerPoint: 9 },
  ],
};

const soil: SiteFactorInput = {
  key: "soil",
  label: "Digging conditions",
  scale: { min: 1, max: 10, baseline: 5 },
  impacts: [{ target: "install_labor", percentPerPoint: 2 }],
};

describe("site factors", () => {
  test("a normal site changes nothing", () => {
    const { multipliers } = computeSiteMultipliers([carryDistance], [{ factorKey: "carry_distance", rating: 5 }]);
    assert.equal(multipliers.install_labor, 1);
    assert.equal(multipliers.surfacing_labor, 1);
  });

  test("a hard site costs more, an easy one costs less", () => {
    const hard = computeSiteMultipliers([carryDistance], [{ factorKey: "carry_distance", rating: 8 }]);
    const easy = computeSiteMultipliers([carryDistance], [{ factorKey: "carry_distance", rating: 2 }]);
    assert.equal(hard.multipliers.install_labor, 1.09);
    assert.equal(easy.multipliers.install_labor, 0.91);
  });

  test("one condition can hit different work very differently", () => {
    // A long carry is a nuisance when bolting decks and a disaster when moving
    // engineered wood fibre by wheelbarrow. That is the whole point of scoping
    // an impact to a cost category.
    const { multipliers } = computeSiteMultipliers([carryDistance], [{ factorKey: "carry_distance", rating: 9 }]);
    assert.equal(multipliers.install_labor, 1.12);
    assert.equal(multipliers.surfacing_labor, 1.36);
  });

  test("factors hitting the same work compound", () => {
    const { multipliers } = computeSiteMultipliers(
      [carryDistance, soil],
      [
        { factorKey: "carry_distance", rating: 8 },
        { factorKey: "soil", rating: 8 },
      ],
    );
    assert.equal(multipliers.install_labor, Math.round(1.09 * 1.06 * 10000) / 10000);
  });

  test("a rating outside the scale is clamped rather than extrapolated", () => {
    const { multipliers, applied } = computeSiteMultipliers(
      [carryDistance],
      [{ factorKey: "carry_distance", rating: 40 }],
    );
    assert.equal(applied[0].rating, 10);
    assert.equal(multipliers.install_labor, 1.15);
  });

  test("a rating for an unknown factor is ignored", () => {
    const { multipliers, applied } = computeSiteMultipliers([carryDistance], [{ factorKey: "gone", rating: 10 }]);
    assert.equal(applied.length, 0);
    assert.equal(multipliers.install_labor, 1);
  });

  test("an explicit curve overrides the straight line, and interpolates between its points", () => {
    const impact = {
      percentPerPoint: 3,
      curve: [
        { rating: 1, multiplier: 0.8 },
        { rating: 5, multiplier: 1.0 },
        { rating: 10, multiplier: 2.0 },
      ],
    };
    assert.equal(multiplierForRating(impact, 5, 5), 1);
    assert.equal(multiplierForRating(impact, 10, 5), 2);
    assert.equal(multiplierForRating(impact, 7.5, 5), 1.5);
    // Beyond the ends of the curve, hold the last value.
    assert.equal(multiplierForRating(impact, 0, 5), 0.8);
  });
});
