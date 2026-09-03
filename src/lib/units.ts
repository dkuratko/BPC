/** Unit conversions used by the estimating engine. Pure functions, no rounding
 *  surprises: callers decide where to round. */

export const CUFT_PER_CUYD = 27;

export function cuFtToCuYd(cuFt: number): number {
  return cuFt / CUFT_PER_CUYD;
}

export function cuYdToCuFt(cuYd: number): number {
  return cuYd * CUFT_PER_CUYD;
}

/**
 * Yield of a bag of pre-mixed concrete, in cubic feet.
 * Manufacturer-published yields; used when a pour is small enough to hand-mix
 * rather than order a ready-mix truck.
 */
export const BAG_YIELD_CUFT: Record<number, number> = {
  50: 0.375,
  60: 0.45,
  80: 0.6,
  90: 0.675,
};

export function bagsRequired(cuFt: number, bagWeightLb: number): number {
  const yieldCuFt = BAG_YIELD_CUFT[bagWeightLb];
  if (!yieldCuFt) throw new Error(`No published yield for a ${bagWeightLb} lb concrete bag`);
  return Math.ceil(cuFt / yieldCuFt);
}

export const UNITS = [
  "each", "hour", "day", "week", "sq_ft", "sq_yd", "cu_ft", "cu_yd",
  "ton", "lb", "linear_ft", "bag", "gallon", "load", "lump_sum", "mile",
] as const;

export type Unit = (typeof UNITS)[number];

export const UNIT_LABELS: Record<Unit, string> = {
  each: "each", hour: "hr", day: "day", week: "wk", sq_ft: "sq ft", sq_yd: "sq yd",
  cu_ft: "cu ft", cu_yd: "cu yd", ton: "ton", lb: "lb", linear_ft: "lin ft",
  bag: "bag", gallon: "gal", load: "load", lump_sum: "lump sum", mile: "mi",
};
