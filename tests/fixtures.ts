import type { EngineInput, EngineSettings, NormalizedPlayground } from "../src/services/types";

/** A complete, deliberately round set of settings so test arithmetic is checkable by hand. */
export function testSettings(overrides: Partial<EngineSettings> = {}): EngineSettings {
  return {
    pricing: {
      defaultMargins: { minimumPct: 30, competitivePct: 33, targetPct: 38 },
      marginPresets: [],
      sizeBandThresholds: { smallMaxDirectCostCents: 1_500_000, mediumMaxDirectCostCents: 7_500_000 },
      hardFloorMarginPct: 30,
    },
    overhead: { percentOfDirectCost: 10 },
    contingency: { percentOfDirectCost: 5 },
    consumables: { enabled: true, percentOfLaborCost: 3 },
    tax: { materialSalesTaxPct: 8.6, applyToMaterials: true, applyToRentals: true, showOnEstimate: false },
    mobilization: {
      minimumChargeCents: 35_000, perMileCents: 285, roundTrip: true,
      trailerCapacityLb: 7_000, perThousandLbCents: 1_200,
      chargeCrewTravelTime: true, averageSpeedMph: 40, loadUnloadHoursPerTrip: 0.75,
    },
    labor: { manufacturerHoursMultiplier: 1.15, productiveHoursPerCrewDay: 8 },
    concrete: {
      baggedMaxCuYd: 1.5, wasteFactorPct: 10, defaultBagWeightLb: 80,
      handMixLaborHoursPerCuYd: 2.5, readyMixLaborHoursPerCuYd: 0.75,
    },
    ...overrides,
  };
}

export function testPlayground(overrides: Partial<NormalizedPlayground> = {}): NormalizedPlayground {
  return {
    sourceType: "preset",
    modelDescription: "Test structure",
    components: [
      {
        componentId: "c1", partNumber: "P-1", name: "Deck", quantity: 4, weightLb: 165,
        laborHoursEach: 1.2, laborSource: "manual", verified: true, complexity: 1,
        footingCountEach: 1, concreteCuFtEach: 2.1,
      },
    ],
    totals: {
      weightLb: 3246, footingCount: 19, concreteCuFt: 40.6,
      componentLaborHours: 4.8, manufacturerLaborHours: 43.3, safetyZoneSqFt: 613,
    },
    unmatched: [],
    ...overrides,
  };
}

export function testInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    settings: testSettings(),
    project: {
      jobType: "school_district",
      milesFromYard: 20,
      customerTaxExempt: false,
      scope: { concrete: true, surfacing: false, excavation: false, demolition: false },
    },
    siteFactors: [],
    siteRatings: [],
    playground: testPlayground(),
    laborRate: { laborRateId: "lr1", name: "3-man crew", crewSize: 3, fullyBurdenedCents: 4000 },
    laborBasis: "manufacturer",
    extraLabor: [],
    materials: [],
    concreteSupply: {
      readyMix: { materialId: "m1", name: "Ready-mix 3000 psi", perCuYdCents: 18_500, deliveryCents: 15_000, minimumCuYd: 1 },
      bagged: { materialId: "m2", name: "80 lb bag", perBagCents: 625, bagWeightLb: 80 },
    },
    rentals: [],
    ownedEquipment: [],
    subcontractors: [],
    manualLines: [],
    baseHaulWeightLb: 800,
    ...overrides,
  };
}
