import { round } from "@/lib/money";
import type { NormalizedComponent, NormalizedPlayground } from "./types";

/**
 * Layer 1 of the engine: turn whatever came in -- a preset model number, a list
 * of part numbers off a manufacturer quote, or hand-picked components -- into
 * one normalized playground with weight, footings, concrete and hours.
 */

export interface ComponentRecordLike {
  id?: string;
  partNumber?: string;
  name: string;
  category?: string;
  weightLb?: number;
  installation?: {
    baseLaborHours?: number;
    laborSource?: string;
    verified?: boolean;
    footingCount?: number;
    concreteCuFt?: number;
    complexity?: number;
  };
  requirements?: {
    equipment?: Array<{ equipmentId: string; quantity?: number; hours?: number; days?: number; required?: boolean }>;
    specialtyTools?: Array<{ name: string }>;
  };
}

export interface LaborInferenceSettings {
  enabled: boolean;
  defaultHoursPer100Lb: number;
  byCategory: Array<{ category: string; hoursPer100Lb: number; footingsPer100Lb?: number }>;
}

/**
 * Until a part has been installed enough times to have real numbers, guess from
 * what we do know: how heavy it is and what kind of thing it is. A 400 lb
 * climber and a 400 lb deck are not the same work, hence the per-category rate.
 * Everything produced here is flagged so the estimate can say which of its
 * hours are measured and which are assumed.
 */
export function inferLaborHours(
  weightLb: number | undefined,
  category: string | undefined,
  inference: LaborInferenceSettings,
): { hours: number; source: string } {
  if (!inference.enabled || !weightLb || weightLb <= 0) {
    return { hours: 0, source: "inferred_weight" };
  }
  const match = inference.byCategory.find((c) => c.category === category);
  const rate = match?.hoursPer100Lb ?? inference.defaultHoursPer100Lb;
  return { hours: round((weightLb / 100) * rate, 2), source: "inferred_weight" };
}

export interface NormalizeInput {
  sourceType: "custom" | "preset" | "unknown";
  modelDescription?: string;
  ageRange?: string;
  assemblyId?: string | null;
  /** Manufacturer's published summary for the structure, when there is one. */
  manufacturerSummary?: {
    laborHours?: number; footingCount?: number; concreteCuFt?: number;
    totalWeightLb?: number; safetyZoneSqFt?: number;
  };
  lines: Array<{ component: ComponentRecordLike; quantity: number }>;
  unmatched?: Array<{ partNumber?: string; description?: string; quantity: number }>;
  inference: LaborInferenceSettings;
}

export function normalizePlayground(input: NormalizeInput): NormalizedPlayground {
  const components: NormalizedComponent[] = input.lines.map(({ component, quantity }) => {
    const inst = component.installation ?? {};
    const hasOwnHours = typeof inst.baseLaborHours === "number" && inst.baseLaborHours > 0;
    const inferred = hasOwnHours
      ? { hours: inst.baseLaborHours as number, source: inst.laborSource ?? "manual" }
      : inferLaborHours(component.weightLb, component.category, input.inference);

    return {
      componentId: component.id ?? null,
      partNumber: component.partNumber,
      name: component.name,
      quantity,
      weightLb: component.weightLb ?? 0,
      laborHoursEach: inferred.hours,
      laborSource: inferred.source,
      verified: Boolean(inst.verified) && hasOwnHours,
      complexity: inst.complexity ?? 1,
      footingCountEach: inst.footingCount ?? 0,
      concreteCuFtEach: inst.concreteCuFt ?? 0,
      equipment: (component.requirements?.equipment ?? []).map((e) => ({
        equipmentId: e.equipmentId,
        quantity: e.quantity ?? 1,
        hours: e.hours,
        days: e.days,
        required: e.required ?? true,
      })),
      specialtyTools: (component.requirements?.specialtyTools ?? []).map((t) => t.name),
    };
  });

  const rolled = components.reduce(
    (acc, c) => ({
      weightLb: acc.weightLb + c.weightLb * c.quantity,
      footingCount: acc.footingCount + c.footingCountEach * c.quantity,
      concreteCuFt: acc.concreteCuFt + c.concreteCuFtEach * c.quantity,
      componentLaborHours: acc.componentLaborHours + c.laborHoursEach * c.complexity * c.quantity,
    }),
    { weightLb: 0, footingCount: 0, concreteCuFt: 0, componentLaborHours: 0 },
  );

  const s = input.manufacturerSummary ?? {};

  return {
    sourceType: input.sourceType,
    modelDescription: input.modelDescription,
    ageRange: input.ageRange,
    assemblyId: input.assemblyId ?? null,
    components,
    totals: {
      // Prefer the manufacturer's own figure where they published one: it covers
      // the whole structure including parts we may not have catalogued yet.
      weightLb: round(s.totalWeightLb ?? rolled.weightLb, 1),
      footingCount: Math.round(s.footingCount ?? rolled.footingCount),
      concreteCuFt: round(s.concreteCuFt ?? rolled.concreteCuFt, 2),
      componentLaborHours: round(rolled.componentLaborHours, 2),
      manufacturerLaborHours: round(s.laborHours ?? 0, 2),
      safetyZoneSqFt: round(s.safetyZoneSqFt ?? 0, 1),
    },
    unmatched: input.unmatched ?? [],
  };
}

/** Explode a preset assembly into component lines, multiplied by how many are ordered. */
export function explodeAssembly(
  assemblyComponents: Array<{ component: ComponentRecordLike; quantity: number }>,
  assemblyQuantity = 1,
): Array<{ component: ComponentRecordLike; quantity: number }> {
  return assemblyComponents.map(({ component, quantity }) => ({
    component,
    quantity: quantity * assemblyQuantity,
  }));
}
