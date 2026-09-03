import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { calculateMobilization } from "../src/services/mobilizationService";
import { testSettings } from "./fixtures";

const settings = testSettings();
const base = { crewSize: 3, fullyBurdenedCents: 4000 };

describe("mobilization", () => {
  test("hauling more than the trailer holds means more trips", () => {
    const one = calculateMobilization({ ...base, milesFromYard: 20, haulWeightLb: 5_000 }, settings);
    const two = calculateMobilization({ ...base, milesFromYard: 20, haulWeightLb: 10_000 }, settings);
    assert.equal(one.trips, 1);
    assert.equal(two.trips, 2);
    assert.ok(two.totalCents > one.totalCents);
  });

  test("distance is charged round trip", () => {
    const result = calculateMobilization({ ...base, milesFromYard: 20, haulWeightLb: 1_000 }, settings);
    assert.equal(result.totalMiles, 40);
    assert.equal(result.distanceCents, Math.round(40 * 285));
  });

  test("crew travel time is paid at the burdened rate", () => {
    const result = calculateMobilization({ ...base, milesFromYard: 40, haulWeightLb: 1_000 }, settings);
    // 80 round-trip miles at 40 mph = 2 hr driving + 0.75 hr load/unload = 2.75 hr.
    assert.equal(result.travelHours, 2.75);
    assert.equal(result.crewTravelCents, Math.round(2.75 * 3 * 4000));
  });

  test("a short hop still costs the minimum", () => {
    const result = calculateMobilization({ ...base, milesFromYard: 1, haulWeightLb: 100 }, settings);
    assert.equal(result.minimumApplied, true);
    assert.equal(result.totalCents, settings.mobilization.minimumChargeCents);
  });

  test("a site factor scales it before the minimum is applied", () => {
    const plain = calculateMobilization({ ...base, milesFromYard: 60, haulWeightLb: 9_000 }, settings);
    const hard = calculateMobilization(
      { ...base, milesFromYard: 60, haulWeightLb: 9_000, siteMultiplier: 1.25 },
      settings,
    );
    assert.ok(hard.totalCents > plain.totalCents);
    assert.equal(hard.totalCents, Math.round(plain.subtotalCents * 1.25));
  });

  test("crew travel can be switched off without breaking the rest", () => {
    const off = testSettings();
    off.mobilization.chargeCrewTravelTime = false;
    const result = calculateMobilization({ ...base, milesFromYard: 60, haulWeightLb: 1_000 }, off);
    assert.equal(result.crewTravelCents, 0);
    assert.ok(result.distanceCents > 0);
  });
});
