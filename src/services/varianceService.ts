import { round } from "@/lib/money";

/**
 * Estimate versus reality.
 *
 * The point of the jobs collection is not to know whether a job made money --
 * the bank tells you that. It is to know that 43.3 estimated hours became 51,
 * because that is the number that fixes the next estimate.
 */

export interface VarianceRow {
  estimated: number;
  actual: number;
  difference: number;
  percent: number;
}

export function varianceOf(estimated: number, actual: number): VarianceRow {
  const difference = round(actual - estimated, 2);
  const percent = estimated === 0 ? (actual === 0 ? 0 : 100) : round((difference / estimated) * 100, 1);
  return { estimated: round(estimated, 2), actual: round(actual, 2), difference, percent };
}

export interface EstimateSideForVariance {
  laborHours: number;
  concreteCuYd: number;
  footingCount: number;
  laborCostCents: number;
  materialCostCents: number;
  rentalCostCents: number;
  equipmentCostCents: number;
  subcontractorCostCents: number;
  mobilizationCostCents: number;
  totalCostCents: number;
  sellingPriceCents: number;
}

export interface ActualSideForVariance {
  laborHours: number;
  concreteCuYd: number;
  footingCount: number;
  laborCostCents: number;
  materialCostCents: number;
  rentalCostCents: number;
  equipmentCostCents: number;
  subcontractorCostCents: number;
  mobilizationCostCents: number;
  totalCostCents: number;
  revenueCents: number;
}

export function computeVariance(
  estimated: EstimateSideForVariance,
  actual: ActualSideForVariance,
): Record<string, VarianceRow> {
  return {
    laborHours: varianceOf(estimated.laborHours, actual.laborHours),
    concreteCuYd: varianceOf(estimated.concreteCuYd, actual.concreteCuYd),
    footingCount: varianceOf(estimated.footingCount, actual.footingCount),
    laborCost: varianceOf(estimated.laborCostCents, actual.laborCostCents),
    materialCost: varianceOf(estimated.materialCostCents, actual.materialCostCents),
    rentalCost: varianceOf(estimated.rentalCostCents, actual.rentalCostCents),
    equipmentCost: varianceOf(estimated.equipmentCostCents, actual.equipmentCostCents),
    subcontractorCost: varianceOf(estimated.subcontractorCostCents, actual.subcontractorCostCents),
    mobilizationCost: varianceOf(estimated.mobilizationCostCents, actual.mobilizationCostCents),
    totalCost: varianceOf(estimated.totalCostCents, actual.totalCostCents),
    revenue: varianceOf(estimated.sellingPriceCents, actual.revenueCents),
  };
}

/** Financial roll-up for a completed job. */
export function computeJobFinancials(revenueCents: number, totalCostCents: number) {
  const grossProfitCents = revenueCents - totalCostCents;
  return {
    revenueCents,
    totalCostCents,
    grossProfitCents,
    grossMarginPct: revenueCents === 0 ? 0 : round((grossProfitCents / revenueCents) * 100, 2),
  };
}
