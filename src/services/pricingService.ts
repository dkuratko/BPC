import { marginOf, priceAtMargin, round } from "@/lib/money";
import type { JobType, SizeBand } from "@/models/Settings";
import type { EngineSettings } from "./types";

/**
 * Cost becomes price by gross margin, not markup.
 *
 * sell = cost / (1 - margin). A 30% margin means dividing by 0.70, which is a
 * 42.9% markup. Adding "30% markup" instead yields a 23% margin -- the single
 * most common way a contractor quietly prices below where they think they are.
 *
 * Three numbers come out: the floor you will not go below, a competitive number
 * for a bid you expect to fight for, and the number you actually want.
 */

export function classifySizeBand(directCostCents: number, settings: EngineSettings): SizeBand {
  const t = settings.pricing.sizeBandThresholds;
  if (directCostCents <= t.smallMaxDirectCostCents) return "small";
  if (directCostCents <= t.mediumMaxDirectCostCents) return "medium";
  return "large";
}

/** Most specific preset wins: exact job type + size band, else the default set. */
export function resolveMargins(
  jobType: JobType,
  sizeBand: SizeBand,
  settings: EngineSettings,
): { minimumPct: number; competitivePct: number; targetPct: number } {
  const preset = settings.pricing.marginPresets.find((p) => p.jobType === jobType && p.sizeBand === sizeBand);
  return preset ? { ...preset.margins } : { ...settings.pricing.defaultMargins };
}

export interface PriceResult {
  jobType: JobType;
  sizeBand: SizeBand;
  margins: { minimumPct: number; competitivePct: number; targetPct: number };
  prices: { minimumCents: number; competitiveCents: number; targetCents: number };
  selectedTier: "minimum" | "competitive" | "target" | "manual";
  manualPriceCents?: number | null;
  sellingPriceCents: number;
  realizedMarginPct: number;
  grossProfitCents: number;
  belowFloor: boolean;
}

export function calculatePricing(
  totalCostCents: number,
  directCostCents: number,
  jobType: JobType,
  settings: EngineSettings,
  override?: {
    selectedTier?: "minimum" | "competitive" | "target" | "manual";
    manualPriceCents?: number | null;
    margins?: { minimumPct: number; competitivePct: number; targetPct: number };
  },
): PriceResult {
  const sizeBand = classifySizeBand(directCostCents, settings);
  const margins = override?.margins ?? resolveMargins(jobType, sizeBand, settings);

  const prices = {
    minimumCents: priceAtMargin(totalCostCents, margins.minimumPct),
    competitiveCents: priceAtMargin(totalCostCents, margins.competitivePct),
    targetCents: priceAtMargin(totalCostCents, margins.targetPct),
  };

  const selectedTier = override?.selectedTier ?? "target";
  const manualPriceCents = override?.manualPriceCents ?? null;

  const sellingPriceCents =
    selectedTier === "manual" && manualPriceCents !== null
      ? manualPriceCents
      : selectedTier === "minimum"
        ? prices.minimumCents
        : selectedTier === "competitive"
          ? prices.competitiveCents
          : prices.targetCents;

  const realizedMarginPct = marginOf(totalCostCents, sellingPriceCents);

  return {
    jobType,
    sizeBand,
    margins,
    prices,
    selectedTier,
    manualPriceCents,
    sellingPriceCents,
    realizedMarginPct,
    grossProfitCents: sellingPriceCents - totalCostCents,
    belowFloor: realizedMarginPct < settings.pricing.hardFloorMarginPct,
  };
}

/** Markup equivalent of a margin, for anyone converting from an old spreadsheet. */
export function marginToMarkup(marginPct: number): number {
  return round((marginPct / (100 - marginPct)) * 100, 2);
}
