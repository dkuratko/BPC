import { strict as assert } from "node:assert";
import { test, describe } from "node:test";
import { runEstimatingEngine } from "../src/services/estimatingEngine";
import { priceAtMargin } from "../src/lib/money";
import { testInput, testPlayground, testSettings } from "./fixtures";
import type { SiteFactorInput } from "../src/services/types";

const carryDistance: SiteFactorInput = {
  key: "carry_distance",
  label: "Carry distance",
  scale: { min: 1, max: 10, baseline: 5 },
  impacts: [
    { target: "install_labor", percentPerPoint: 3 },
    { target: "surfacing_labor", percentPerPoint: 9 },
    { target: "rental_days", percentPerPoint: 5 },
  ],
};

describe("estimating engine", () => {
  test("manufacturer hours are the labor baseline, with the Build Play factor applied", () => {
    const result = runEstimatingEngine(testInput());
    // 43.3 published hours x 1.15 = 49.79 man-hours.
    assert.equal(result.requirements.laborHours.componentInstall, 49.79);
    const laborLine = result.lineItems.find((li) => li.description.startsWith("Playground installation"));
    assert.ok(laborLine);
    assert.equal(laborLine!.costCents, Math.round(49.79 * 4000));
    assert.ok(laborLine!.calculation.explanation?.includes("Manufacturer published"));
  });

  test("man-hours convert to crew days using the crew size", () => {
    const result = runEstimatingEngine(testInput());
    const expected = result.requirements.laborHours.adjustedTotal / (3 * 8);
    assert.ok(Math.abs(result.requirements.crewDays - expected) < 0.01);
  });

  test("falling back to component hours is reported, not silent", () => {
    const result = runEstimatingEngine(
      testInput({
        playground: testPlayground({
          totals: { ...testPlayground().totals, manufacturerLaborHours: 0 },
        }),
      }),
    );
    assert.equal(result.requirements.laborHours.componentInstall, 4.8);
    assert.ok(result.warnings.some((w) => w.ref === "labor.basis"));
  });

  test("costs roll up into direct cost, and direct cost into total cost", () => {
    const result = runEstimatingEngine(testInput());
    const t = result.totals;
    const summed =
      t.laborCostCents + t.materialCostCents + t.materialTaxCents + t.consumablesCostCents +
      t.equipmentCostCents + t.rentalCostCents + t.subcontractorCostCents +
      t.mobilizationCostCents + t.otherCostCents;
    assert.equal(t.directCostCents, summed);
    assert.equal(t.overheadCostCents, Math.round(t.directCostCents * 0.1));
    assert.equal(t.contingencyCostCents, Math.round(t.directCostCents * 0.05));
    assert.equal(t.totalCostCents, t.directCostCents + t.overheadCostCents + t.contingencyCostCents);
  });

  test("the selling price is the total cost at the chosen gross margin", () => {
    const result = runEstimatingEngine(testInput());
    assert.equal(result.pricing.sellingPriceCents, priceAtMargin(result.totals.totalCostCents, 38));
    assert.equal(
      result.pricing.grossProfitCents,
      result.pricing.sellingPriceCents - result.totals.totalCostCents,
    );
  });

  test("consumables follow labor, not job size", () => {
    const result = runEstimatingEngine(testInput());
    assert.equal(result.totals.consumablesCostCents, Math.round(result.totals.laborCostCents * 0.03));
  });

  test("sales tax is carried as a cost and dropped for a tax-exempt customer", () => {
    const taxed = runEstimatingEngine(testInput());
    const exempt = runEstimatingEngine(
      testInput({
        project: { ...testInput().project, customerTaxExempt: true },
      }),
    );
    assert.ok(taxed.totals.materialTaxCents > 0);
    assert.equal(exempt.totals.materialTaxCents, 0);
    assert.ok(exempt.assumptions.some((a) => a.includes("tax exempt")));
    // The tax line is internal: the customer's estimate does not show it.
    const taxLine = taxed.lineItems.find((li) => li.category === "tax");
    assert.equal(taxLine?.internalOnly, true);
  });

  test("a hard site raises labor and can stretch a rental", () => {
    const input = testInput({
      siteFactors: [carryDistance],
      siteRatings: [{ factorKey: "carry_distance", rating: 9 }],
      rentals: [
        {
          equipmentId: "e1",
          equipmentName: "Telehandler",
          days: 2,
          breakdown: {
            days: 2, billedAs: "daily", billedQuantity: 2, unitRateCents: 38_500,
            rentalCents: 77_000, deliveryCents: 15_000, pickupCents: 15_000, cleaningCents: 0,
            environmentalCents: 0, damageWaiverCents: 0, otherCents: 0, fuelCents: 0,
            totalCents: 107_000, explanation: "2 days",
          },
          rate: {
            rates: { dailyCents: 38_500, weeklyCents: 115_000 },
            fees: { deliveryCents: 15_000, pickupCents: 15_000 },
            minimumRental: { quantity: 1, unit: "day" },
          },
          reason: "Roof sections",
        },
      ],
    });

    const plain = runEstimatingEngine(testInput({ rentals: input.rentals }));
    const hard = runEstimatingEngine(input);

    // 9/10 on a 3%-per-point factor = 1.12 on install labor.
    assert.equal(hard.siteMultipliers.install_labor, 1.12);
    assert.ok(hard.totals.laborCostCents > plain.totals.laborCostCents);
    // 2 days x 1.2 = 2.4, rounded up to whole days on the yard's ticket.
    assert.equal(hard.requirements.rentals[0].days, 3);
    assert.ok(hard.totals.rentalCostCents > plain.totals.rentalCostCents);
  });

  test("owned equipment is charged to the job and adds to the haul weight", () => {
    const result = runEstimatingEngine(
      testInput({
        ownedEquipment: [
          { equipmentId: "t66", name: "Bobcat T66", days: 3, dailyCents: 32_000, transportWeightLb: 9_200 },
        ],
      }),
    );
    assert.equal(result.totals.equipmentCostCents, 96_000);
    const mob = result.lineItems.find((li) => li.category === "mobilization");
    // 800 lb of tools + a 9,200 lb machine against a 7,000 lb trailer is two trips.
    assert.equal(mob?.calculation.inputs?.trips, 2);
  });

  test("subcontracted work is a cost like any other, with the job margin on top", () => {
    const result = runEstimatingEngine(
      testInput({
        subcontractors: [
          {
            service: "PIP rubber installed", unit: "sq_ft", quantity: 600,
            unitCostCents: 1_650, minimumChargeCents: 450_000, markupPct: 0,
          },
        ],
      }),
    );
    assert.equal(result.totals.subcontractorCostCents, 600 * 1_650);
    assert.ok(result.pricing.sellingPriceCents > result.totals.totalCostCents);
  });

  test("a subcontractor minimum charge is applied when the quantity is small", () => {
    const result = runEstimatingEngine(
      testInput({
        subcontractors: [
          { service: "PIP patch", unit: "sq_ft", quantity: 10, unitCostCents: 1_650, minimumChargeCents: 450_000 },
        ],
      }),
    );
    assert.equal(result.totals.subcontractorCostCents, 450_000);
  });

  test("material waste is ordered and the line explains itself", () => {
    const result = runEstimatingEngine(
      testInput({
        materials: [
          {
            materialId: "m9", name: "Engineered wood fibre", category: "surfacing_ewf",
            unit: "cu_yd", quantity: 20, unitCostCents: 4_200, wasteFactorPct: 10,
            laborHoursPerUnit: 0.35, laborBucket: "surfacing",
          },
        ],
      }),
    );
    const line = result.lineItems.find((li) => li.category === "surfacing");
    assert.ok(line);
    assert.equal(line!.quantity, 22);
    assert.equal(line!.costCents, Math.round(22 * 4_200));
    assert.equal(result.requirements.laborHours.surfacing, 7);
    assert.ok(line!.calculation.explanation?.includes("waste"));
  });

  test("every line can explain where its number came from", () => {
    const result = runEstimatingEngine(
      testInput({
        rentals: [
          {
            equipmentId: "e1", equipmentName: "Auger", days: 1,
            breakdown: {
              days: 1, billedAs: "daily", billedQuantity: 1, unitRateCents: 18_500,
              rentalCents: 18_500, deliveryCents: 9_500, pickupCents: 9_500, cleaningCents: 0,
              environmentalCents: 0, damageWaiverCents: 0, otherCents: 0, fuelCents: 0,
              totalCents: 37_500, explanation: "1 day",
            },
          },
        ],
      }),
    );
    for (const line of result.lineItems) {
      assert.ok(line.calculation.explanation, `${line.description} has no explanation`);
      assert.ok(line.calculation.formula, `${line.description} has no formula`);
      assert.ok(Number.isInteger(line.costCents), `${line.description} is not whole cents`);
    }
  });

  test("unmatched quote lines are an error, not a rounding difference", () => {
    const result = runEstimatingEngine(
      testInput({
        playground: testPlayground({ unmatched: [{ partNumber: "XX-1", quantity: 2 }] }),
      }),
    );
    assert.ok(result.warnings.some((w) => w.ref === "playground.unmatched" && w.level === "error"));
  });

  test("labor hours inferred from weight are flagged on the estimate", () => {
    const result = runEstimatingEngine(
      testInput({
        laborBasis: "components",
        playground: testPlayground({
          components: [
            {
              componentId: "c9", name: "Unknown climber", quantity: 1, weightLb: 400,
              laborHoursEach: 4, laborSource: "inferred_weight", verified: false,
              complexity: 1, footingCountEach: 0, concreteCuFtEach: 0,
            },
          ],
        }),
      }),
    );
    assert.ok(result.warnings.some((w) => w.ref === "labor.inferred"));
  });

  test("no labor rate is an error rather than a free job", () => {
    const result = runEstimatingEngine(
      testInput({
        laborRate: { laborRateId: null, name: "None", crewSize: 1, fullyBurdenedCents: 0 },
      }),
    );
    assert.equal(result.totals.laborCostCents, 0);
    assert.ok(result.warnings.some((w) => w.ref === "labor.rate" && w.level === "error"));
  });

  test("dropping concrete from scope removes its cost and its hours", () => {
    const withConcrete = runEstimatingEngine(testInput());
    const without = runEstimatingEngine(
      testInput({
        project: { ...testInput().project, scope: { concrete: false, surfacing: false, excavation: false, demolition: false } },
      }),
    );
    assert.ok(withConcrete.totals.materialCostCents > 0);
    assert.equal(without.totals.materialCostCents, 0);
    assert.equal(without.requirements.laborHours.concrete, 0);
  });

  test("a price below the floor is flagged", () => {
    const result = runEstimatingEngine(
      testInput({ pricingOverride: { selectedTier: "manual", manualPriceCents: 100 } }),
    );
    assert.ok(result.warnings.some((w) => w.ref === "pricing.floor"));
  });

  test("the same inputs always produce the same estimate", () => {
    const a = runEstimatingEngine(testInput());
    const b = runEstimatingEngine(testInput());
    assert.deepEqual(a.totals, b.totals);
    assert.deepEqual(a.pricing, b.pricing);
  });

  test("overhead and contingency percentages move the price, not the direct cost", () => {
    const lean = testSettings();
    lean.overhead.percentOfDirectCost = 0;
    lean.contingency.percentOfDirectCost = 0;
    const base = runEstimatingEngine(testInput());
    const stripped = runEstimatingEngine(testInput({ settings: lean }));
    assert.equal(base.totals.directCostCents, stripped.totals.directCostCents);
    assert.ok(base.totals.totalCostCents > stripped.totals.totalCostCents);
  });
});
