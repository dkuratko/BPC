import { round } from "@/lib/money";
import type { RentalBreakdown } from "./types";

/**
 * Price a rental across every vendor that carries the machine and return the
 * cheapest, plus the alternatives.
 *
 * Comparison is internal. The customer sees "telehandler, 2 days"; which yard
 * it came from and what the other yards wanted is Build Play's business.
 *
 * Rental days are NOT job duration. A telehandler might be on site for two days
 * of a two-week job, so the day count is an input, not something inferred from
 * the schedule.
 */

export interface RentalRateLike {
  id?: string;
  vendorId?: string | null;
  vendorName?: string;
  rates: { hourlyCents?: number; dailyCents?: number; weeklyCents?: number; monthlyCents?: number };
  fees: {
    deliveryCents?: number; pickupCents?: number; cleaningCents?: number;
    environmentalPct?: number; damageWaiverPct?: number; otherCents?: number;
  };
  fuelIncluded?: boolean;
  minimumRental?: { quantity?: number; unit?: "hour" | "day" | "week" };
}

export interface PricedRental {
  rateId?: string;
  vendorId?: string | null;
  vendorName?: string;
  breakdown: RentalBreakdown;
}

/**
 * Rental yards bill by the day up to about a week, then switch to the weekly
 * rate because it is cheaper. Take whichever billing basis costs less.
 */
export function priceRental(
  rate: RentalRateLike,
  days: number,
  opts: { fuelCostCents?: number } = {},
): RentalBreakdown {
  const minDays =
    rate.minimumRental?.unit === "week"
      ? (rate.minimumRental.quantity ?? 1) * 7
      : rate.minimumRental?.unit === "day"
        ? (rate.minimumRental.quantity ?? 1)
        : 1;
  const billableDays = Math.max(days, minDays);

  const candidates: Array<{ basis: RentalBreakdown["billedAs"]; qty: number; unitRate: number; total: number }> = [];

  if (rate.rates.dailyCents) {
    candidates.push({
      basis: "daily", qty: billableDays, unitRate: rate.rates.dailyCents,
      total: billableDays * rate.rates.dailyCents,
    });
  }
  if (rate.rates.weeklyCents) {
    const weeks = Math.ceil(billableDays / 7);
    candidates.push({
      basis: "weekly", qty: weeks, unitRate: rate.rates.weeklyCents,
      total: weeks * rate.rates.weeklyCents,
    });
  }
  if (rate.rates.monthlyCents) {
    const months = Math.ceil(billableDays / 28);
    candidates.push({
      basis: "monthly", qty: months, unitRate: rate.rates.monthlyCents,
      total: months * rate.rates.monthlyCents,
    });
  }
  if (candidates.length === 0 && rate.rates.hourlyCents) {
    const hours = billableDays * 8;
    candidates.push({
      basis: "hourly", qty: hours, unitRate: rate.rates.hourlyCents,
      total: hours * rate.rates.hourlyCents,
    });
  }

  if (candidates.length === 0) {
    return {
      days, billedAs: "daily", billedQuantity: 0, unitRateCents: 0, rentalCents: 0,
      deliveryCents: 0, pickupCents: 0, cleaningCents: 0, environmentalCents: 0,
      damageWaiverCents: 0, otherCents: 0, fuelCents: 0, totalCents: 0,
      explanation: "No rate on file for this vendor.",
    };
  }

  const best = candidates.reduce((a, b) => (b.total < a.total ? b : a));

  const f = rate.fees ?? {};
  const environmentalCents = Math.round((best.total * (f.environmentalPct ?? 0)) / 100);
  const damageWaiverCents = Math.round((best.total * (f.damageWaiverPct ?? 0)) / 100);
  const fuelCents = rate.fuelIncluded ? 0 : (opts.fuelCostCents ?? 0);

  const totalCents =
    best.total + (f.deliveryCents ?? 0) + (f.pickupCents ?? 0) + (f.cleaningCents ?? 0) +
    environmentalCents + damageWaiverCents + (f.otherCents ?? 0) + fuelCents;

  const minNote = billableDays > days ? ` (${minDays}-day vendor minimum applied)` : "";
  const basisNote =
    candidates.length > 1
      ? ` Billed ${best.basis} as the cheaper basis for ${billableDays} day${billableDays === 1 ? "" : "s"}.`
      : "";

  return {
    days,
    billedAs: best.basis,
    billedQuantity: best.qty,
    unitRateCents: best.unitRate,
    rentalCents: best.total,
    deliveryCents: f.deliveryCents ?? 0,
    pickupCents: f.pickupCents ?? 0,
    cleaningCents: f.cleaningCents ?? 0,
    environmentalCents,
    damageWaiverCents,
    otherCents: f.otherCents ?? 0,
    fuelCents,
    totalCents,
    explanation:
      `${days} day${days === 1 ? "" : "s"}${minNote} x ${best.qty} ${best.basis} unit(s).${basisNote}`,
  };
}

/** Cheapest first. The rest are kept so the estimator can see what was rejected. */
export function compareVendors(
  rates: RentalRateLike[],
  days: number,
  opts: { fuelCostCents?: number } = {},
): PricedRental[] {
  return rates
    .map((rate) => ({
      rateId: rate.id,
      vendorId: rate.vendorId ?? null,
      vendorName: rate.vendorName,
      breakdown: priceRental(rate, days, opts),
    }))
    .filter((p) => p.breakdown.totalCents > 0)
    .sort((a, b) => a.breakdown.totalCents - b.breakdown.totalCents);
}

/** How much a vendor choice is worth, for the comparison panel. */
export function savingsAgainstWorst(priced: PricedRental[]): number {
  if (priced.length < 2) return 0;
  return priced[priced.length - 1].breakdown.totalCents - priced[0].breakdown.totalCents;
}

export function roundDays(days: number): number {
  return round(Math.max(days, 0), 2);
}
