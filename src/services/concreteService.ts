import { round } from "@/lib/money";
import { bagsRequired, cuFtToCuYd } from "@/lib/units";
import type { ConcreteSupplyInput, EngineSettings } from "./types";

/**
 * Footing concrete, supplied whichever way is sane for the volume.
 *
 * A handful of footings gets bags mixed on site; once the pour is big enough
 * the delivery fee stops mattering and a ready-mix truck is cheaper and far
 * faster. The estimate records which way it went and why, because the labor
 * difference between the two is large (hand-mixing a yard is most of a
 * crew-hour-per-yard proposition; placing from a truck is not).
 */

export type ConcreteMethod = "bagged" | "ready_mix" | "none";

export interface ConcreteResult {
  method: ConcreteMethod;
  rawCuFt: number;
  wasteFactorPct: number;
  orderedCuFt: number;
  orderedCuYd: number;
  /** Bags to buy, when hand-mixing. */
  bagCount: number;
  bagWeightLb: number;
  materialCents: number;
  deliveryCents: number;
  totalMaterialCents: number;
  laborHours: number;
  materialId?: string | null;
  materialName: string;
  explanation: string;
}

export function calculateConcrete(
  rawCuFt: number,
  settings: EngineSettings,
  supply: ConcreteSupplyInput | undefined,
  opts: { forceMethod?: ConcreteMethod } = {},
): ConcreteResult {
  const waste = settings.concrete.wasteFactorPct;
  const orderedCuFt = round(rawCuFt * (1 + waste / 100), 2);
  const orderedCuYd = round(cuFtToCuYd(orderedCuFt), 3);

  const empty: ConcreteResult = {
    method: "none", rawCuFt, wasteFactorPct: waste, orderedCuFt, orderedCuYd,
    bagCount: 0, bagWeightLb: 0, materialCents: 0, deliveryCents: 0,
    totalMaterialCents: 0, laborHours: 0, materialName: "",
    explanation: "No concrete in scope.",
  };

  if (rawCuFt <= 0) return empty;

  const method: ConcreteMethod =
    opts.forceMethod ??
    (orderedCuYd <= settings.concrete.baggedMaxCuYd && supply?.bagged ? "bagged" : "ready_mix");

  if (method === "bagged") {
    if (!supply?.bagged) {
      return { ...empty, method: "none", explanation: "No bagged concrete price on file." };
    }
    const bagWeightLb = supply.bagged.bagWeightLb || settings.concrete.defaultBagWeightLb;
    const bagCount = bagsRequired(orderedCuFt, bagWeightLb);
    const materialCents = bagCount * supply.bagged.perBagCents;
    const laborHours = round(orderedCuYd * settings.concrete.handMixLaborHoursPerCuYd, 2);
    return {
      method: "bagged",
      rawCuFt, wasteFactorPct: waste, orderedCuFt, orderedCuYd,
      bagCount, bagWeightLb,
      materialCents, deliveryCents: 0, totalMaterialCents: materialCents,
      laborHours,
      materialId: supply.bagged.materialId ?? null,
      materialName: supply.bagged.name,
      explanation:
        `${rawCuFt} cu ft of footings + ${waste}% waste = ${orderedCuFt} cu ft (${orderedCuYd} cu yd). ` +
        `At or under the ${settings.concrete.baggedMaxCuYd} cu yd hand-mix threshold, so ${bagCount} x ` +
        `${bagWeightLb} lb bags, mixed on site at ${settings.concrete.handMixLaborHoursPerCuYd} hr/cu yd.`,
    };
  }

  if (!supply?.readyMix) {
    return { ...empty, method: "none", explanation: "No ready-mix concrete price on file." };
  }

  // Ready-mix plants charge for a minimum load whether or not you use it.
  const minimumCuYd = supply.readyMix.minimumCuYd ?? 0;
  const billedCuYd = Math.max(orderedCuYd, minimumCuYd);
  const materialCents = Math.round(billedCuYd * supply.readyMix.perCuYdCents);
  const deliveryCents = supply.readyMix.deliveryCents ?? 0;
  const laborHours = round(orderedCuYd * settings.concrete.readyMixLaborHoursPerCuYd, 2);

  const minNote =
    billedCuYd > orderedCuYd
      ? ` Billed at the ${minimumCuYd} cu yd plant minimum rather than the ${orderedCuYd} cu yd needed.`
      : "";

  return {
    method: "ready_mix",
    rawCuFt, wasteFactorPct: waste, orderedCuFt, orderedCuYd: billedCuYd,
    bagCount: 0, bagWeightLb: 0,
    materialCents, deliveryCents, totalMaterialCents: materialCents + deliveryCents,
    laborHours,
    materialId: supply.readyMix.materialId ?? null,
    materialName: supply.readyMix.name,
    explanation:
      `${rawCuFt} cu ft of footings + ${waste}% waste = ${orderedCuFt} cu ft (${orderedCuYd} cu yd). ` +
      `Over the ${settings.concrete.baggedMaxCuYd} cu yd hand-mix threshold, so ready-mix delivered.${minNote}`,
  };
}
