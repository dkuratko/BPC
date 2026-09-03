import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { computeBurdenedRate } from "../src/services/laborBurdenService";

describe("labor burden", () => {
  test("burden is applied on top of the base wage", () => {
    const result = computeBurdenedRate(2600, {
      payrollTaxPct: 9.5, workersCompPct: 10, benefitsPct: 5, otherPct: 2, overheadAllocationPct: 0,
    });
    assert.equal(result.totalBurdenPct, 26.5);
    assert.equal(result.fullyBurdenedCents, Math.round(2600 * 1.265));
    assert.equal(result.burdenCents, result.fullyBurdenedCents - 2600);
  });

  test("a $26 wage really costs about $33 an hour", () => {
    const result = computeBurdenedRate(2600, {
      payrollTaxPct: 9.5, workersCompPct: 10, benefitsPct: 5, otherPct: 2,
    });
    assert.ok(result.fullyBurdenedCents > 3200 && result.fullyBurdenedCents < 3400);
  });

  test("the breakdown adds up to the burden", () => {
    const result = computeBurdenedRate(3000, { payrollTaxPct: 9.5, workersCompPct: 12, benefitsPct: 4 });
    const summed = result.breakdown.reduce((acc, b) => acc + b.cents, 0);
    assert.ok(Math.abs(summed - result.burdenCents) <= 1, "rounding should not lose more than a cent");
  });

  test("missing percentages are treated as zero, not as NaN", () => {
    const result = computeBurdenedRate(2500, {});
    assert.equal(result.fullyBurdenedCents, 2500);
    assert.equal(result.totalBurdenPct, 0);
  });
});
