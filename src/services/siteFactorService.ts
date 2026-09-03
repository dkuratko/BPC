import { round } from "@/lib/money";
import { FACTOR_TARGETS, type FactorTarget } from "@/models/SiteFactor";
import type { SiteFactorInput, SiteRatingInput } from "./types";

/**
 * Turn a set of 1-10 site ratings into one multiplier per cost target.
 *
 * A rating at the factor's baseline (normally 5 = "standard") contributes 1.0.
 * Above baseline the job gets harder, below it gets easier. Factors that touch
 * the same target compound: a long carry AND bad soil is worse than either
 * alone, which is how it works on site.
 */

export function multiplierForRating(
  impact: { percentPerPoint: number; curve?: Array<{ rating: number; multiplier: number }> },
  rating: number,
  baseline: number,
): number {
  if (impact.curve && impact.curve.length > 0) {
    // Exact match wins; otherwise interpolate between the two nearest points.
    const sorted = [...impact.curve].sort((a, b) => a.rating - b.rating);
    const exact = sorted.find((p) => p.rating === rating);
    if (exact) return exact.multiplier;
    if (rating <= sorted[0].rating) return sorted[0].multiplier;
    const last = sorted[sorted.length - 1];
    if (rating >= last.rating) return last.multiplier;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (rating > a.rating && rating < b.rating) {
        const t = (rating - a.rating) / (b.rating - a.rating);
        return a.multiplier + t * (b.multiplier - a.multiplier);
      }
    }
    return 1;
  }
  return 1 + ((rating - baseline) * impact.percentPerPoint) / 100;
}

export interface SiteMultiplierResult {
  multipliers: Record<FactorTarget, number>;
  applied: Array<{
    factorKey: string;
    label: string;
    rating: number;
    baseline: number;
    impacts: Array<{ target: string; multiplier: number }>;
    note?: string;
  }>;
}

export function computeSiteMultipliers(
  factors: SiteFactorInput[],
  ratings: SiteRatingInput[],
): SiteMultiplierResult {
  const multipliers = Object.fromEntries(FACTOR_TARGETS.map((t) => [t, 1])) as Record<FactorTarget, number>;
  const applied: SiteMultiplierResult["applied"] = [];

  const byKey = new Map(factors.map((f) => [f.key, f]));

  for (const rating of ratings) {
    const factor = byKey.get(rating.factorKey);
    if (!factor) continue;

    const clamped = Math.min(Math.max(rating.rating, factor.scale.min), factor.scale.max);
    const impacts: Array<{ target: string; multiplier: number }> = [];

    for (const impact of factor.impacts) {
      const m = multiplierForRating(impact, clamped, factor.scale.baseline);
      // A multiplier of exactly 1 is a no-op; recording it anyway keeps the
      // estimate's explanation honest about what was considered.
      multipliers[impact.target] = multipliers[impact.target] * m;
      impacts.push({ target: impact.target, multiplier: round(m, 4) });
    }

    applied.push({
      factorKey: factor.key,
      label: factor.label,
      rating: clamped,
      baseline: factor.scale.baseline,
      impacts,
      note: rating.note,
    });
  }

  for (const t of FACTOR_TARGETS) multipliers[t] = round(multipliers[t], 4);
  return { multipliers, applied };
}

/** Human-readable summary of why a category was scaled, for the line item. */
export function explainMultiplier(
  target: FactorTarget,
  applied: SiteMultiplierResult["applied"],
): string {
  const parts = applied
    .flatMap((a) =>
      a.impacts
        .filter((i) => i.target === target && i.multiplier !== 1)
        .map((i) => `${a.label} rated ${a.rating}/10 = x${i.multiplier}`),
    );
  return parts.length ? parts.join("; ") : "No site adjustment";
}
