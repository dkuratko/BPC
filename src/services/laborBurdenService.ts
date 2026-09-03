import { round } from "@/lib/money";

/**
 * Base wage is not what an hour costs. Payroll taxes, workers comp (the big one
 * in construction), benefits and small per-employee costs sit on top of it.
 */
export interface BurdenPercentages {
  payrollTaxPct: number;
  workersCompPct: number;
  benefitsPct: number;
  otherPct: number;
  /**
   * Usually 0 here. Overhead is applied once at the estimate level as a
   * percentage of direct cost; loading it into the labor rate as well charges
   * for the office twice.
   */
  overheadAllocationPct: number;
}

export interface BurdenResult {
  baseWageCents: number;
  totalBurdenPct: number;
  burdenCents: number;
  fullyBurdenedCents: number;
  breakdown: Array<{ label: string; percent: number; cents: number }>;
}

export function computeBurdenedRate(baseWageCents: number, burden: Partial<BurdenPercentages>): BurdenResult {
  const b: BurdenPercentages = {
    payrollTaxPct: burden.payrollTaxPct ?? 0,
    workersCompPct: burden.workersCompPct ?? 0,
    benefitsPct: burden.benefitsPct ?? 0,
    otherPct: burden.otherPct ?? 0,
    overheadAllocationPct: burden.overheadAllocationPct ?? 0,
  };

  const entries: Array<[string, number]> = [
    ["Payroll taxes (FICA, FUTA, SUTA)", b.payrollTaxPct],
    ["Workers compensation", b.workersCompPct],
    ["Benefits", b.benefitsPct],
    ["Other (PPE, phone, training)", b.otherPct],
    ["Overhead allocation", b.overheadAllocationPct],
  ];

  const breakdown = entries.map(([label, percent]) => ({
    label,
    percent,
    cents: Math.round((baseWageCents * percent) / 100),
  }));

  const totalBurdenPct = round(entries.reduce((acc, [, p]) => acc + p, 0), 4);
  const fullyBurdenedCents = Math.round(baseWageCents * (1 + totalBurdenPct / 100));

  return {
    baseWageCents,
    totalBurdenPct,
    burdenCents: fullyBurdenedCents - baseWageCents,
    fullyBurdenedCents,
    breakdown,
  };
}
