import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { marginOf, multiplyCents, percentOf, priceAtMargin, sumCents, toCents } from "../src/lib/money";

describe("money", () => {
  test("dollars convert to integer cents without float drift", () => {
    assert.equal(toCents(0.1) + toCents(0.2), toCents(0.3));
    assert.equal(toCents("$1,234.56"), 123_456);
    assert.equal(toCents(19.995), 2000);
    assert.equal(toCents(""), 0);
    assert.equal(toCents(undefined), 0);
  });

  test("gross margin pricing is not markup", () => {
    // The distinction that quietly costs contractors money: at a 30% margin the
    // price is cost / 0.70, which is a 42.9% markup, not a 30% one.
    assert.equal(priceAtMargin(70_000, 30), 100_000);
    assert.notEqual(priceAtMargin(70_000, 30), multiplyCents(70_000, 1.3));
    assert.equal(marginOf(70_000, 100_000), 30);
  });

  test("price and margin round-trip", () => {
    for (const margin of [25, 30, 33, 38, 45]) {
      const price = priceAtMargin(123_456, margin);
      assert.ok(Math.abs(marginOf(123_456, price) - margin) < 0.01, `margin ${margin}`);
    }
  });

  test("a margin of 100% or more is rejected rather than dividing by zero", () => {
    assert.throws(() => priceAtMargin(100_000, 100));
    assert.throws(() => priceAtMargin(100_000, 120));
  });

  test("percentages and sums stay in whole cents", () => {
    assert.equal(percentOf(100_001, 8.6), 8600);
    assert.equal(sumCents([1, 2, undefined, null, 3]), 6);
    assert.ok(Number.isInteger(percentOf(33_333, 12)));
  });
});
