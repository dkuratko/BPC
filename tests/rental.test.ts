import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { compareVendors, priceRental, savingsAgainstWorst } from "../src/services/rentalPricingService";

const sunstate = {
  id: "r1", vendorId: "v1", vendorName: "Sunstate",
  rates: { dailyCents: 38_500, weeklyCents: 115_000 },
  fees: { deliveryCents: 15_000, pickupCents: 15_000, environmentalPct: 3, damageWaiverPct: 14 },
  minimumRental: { quantity: 1, unit: "day" as const },
};

const united = {
  id: "r2", vendorId: "v2", vendorName: "United",
  rates: { dailyCents: 41_000, weeklyCents: 109_000 },
  fees: { deliveryCents: 12_500, pickupCents: 12_500, environmentalPct: 2.5, damageWaiverPct: 14 },
  minimumRental: { quantity: 1, unit: "day" as const },
};

describe("rental pricing", () => {
  test("two days is billed daily", () => {
    const result = priceRental(sunstate, 2);
    assert.equal(result.billedAs, "daily");
    assert.equal(result.rentalCents, 2 * 38_500);
  });

  test("five days is cheaper on the weekly rate, so the weekly rate is used", () => {
    const result = priceRental(sunstate, 5);
    assert.equal(result.billedAs, "weekly");
    assert.equal(result.rentalCents, 115_000);
    assert.ok(result.explanation.includes("cheaper"));
  });

  test("fees and percentage charges are all in the total", () => {
    const result = priceRental(sunstate, 2);
    const rental = 2 * 38_500;
    const expected =
      rental + 15_000 + 15_000 + Math.round(rental * 0.03) + Math.round(rental * 0.14);
    assert.equal(result.totalCents, expected);
  });

  test("fuel is added unless the vendor includes it", () => {
    const without = priceRental({ ...sunstate, fuelIncluded: false }, 1, { fuelCostCents: 8_000 });
    const included = priceRental({ ...sunstate, fuelIncluded: true }, 1, { fuelCostCents: 8_000 });
    assert.equal(without.fuelCents, 8_000);
    assert.equal(included.fuelCents, 0);
  });

  test("a vendor's minimum rental period is honoured", () => {
    const weekMinimum = { ...sunstate, minimumRental: { quantity: 1, unit: "week" as const } };
    const result = priceRental(weekMinimum, 1);
    assert.equal(result.billedAs, "weekly");
    assert.ok(result.explanation.includes("minimum"));
  });

  test("the cheapest vendor for the duration wins, and it is not always the same one", () => {
    const twoDays = compareVendors([sunstate, united], 2);
    const twoWeeks = compareVendors([sunstate, united], 10);
    assert.equal(twoDays[0].vendorName, "Sunstate");
    // United's weekly rate is lower, so a longer rental flips the answer.
    assert.equal(twoWeeks[0].vendorName, "United");
    assert.ok(savingsAgainstWorst(twoDays) > 0);
  });

  test("a vendor with no rate on file is left out rather than priced at zero", () => {
    const priced = compareVendors([{ id: "r3", rates: {}, fees: {} }, sunstate], 2);
    assert.equal(priced.length, 1);
    assert.equal(priced[0].rateId, "r1");
  });
});
