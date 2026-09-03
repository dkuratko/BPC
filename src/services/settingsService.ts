import type { HydratedDocument } from "mongoose";
import { connectDb } from "@/lib/db";
import { Settings, type SettingsDoc } from "@/models/Settings";
import type { EngineSettings } from "./types";

/** There is exactly one settings document; create it with defaults on first read. */
export async function getSettings(): Promise<HydratedDocument<SettingsDoc>> {
  await connectDb();
  const existing = await Settings.findOne({ key: "default" });
  if (existing) return existing;
  return Settings.create({ key: "default" });
}

/**
 * Narrow the settings document to just what the engine reads.
 *
 * Converts to a plain object FIRST, via `.toObject()`. A Mongoose subdocument
 * looks like a normal object when you read a field off it directly
 * (`doc.pricing.defaultMargins.minimumPct` works fine, via a getter) but
 * silently falls apart the moment anything spreads it (`{ ...doc.pricing.
 * defaultMargins }`) or `Object.assign`s it -- spread only copies OWN
 * enumerable properties, and Mongoose defines each schema path as a getter on
 * the prototype, not as one of those. The result is an object full of
 * Mongoose's own internals (`_doc`, `$__`, `$__parent`) with every real field
 * reading back as `undefined`. That produced this exact failure: `undefined`
 * margins fed into `cost / (1 - undefined/100)` are `NaN`, and Mongoose then
 * refuses to save a NaN into a Number field on the estimate.
 *
 * `EngineSettings` is a plain-object contract on purpose (see services/types.ts)
 * precisely so the engine never has to know or care whether its input came
 * from Mongoose, a test fixture, or anywhere else -- doing the conversion once
 * here, at the boundary, is what keeps that contract actually true.
 */
export function toEngineSettings(settings: SettingsDoc | HydratedDocument<SettingsDoc>): EngineSettings {
  const plain: SettingsDoc =
    "toObject" in settings && typeof settings.toObject === "function"
      ? settings.toObject({ getters: true, virtuals: false })
      : settings;

  return {
    pricing: {
      defaultMargins: plain.pricing.defaultMargins,
      marginPresets: plain.pricing.marginPresets,
      sizeBandThresholds: plain.pricing.sizeBandThresholds,
      hardFloorMarginPct: plain.pricing.hardFloorMarginPct,
    },
    overhead: { percentOfDirectCost: plain.overhead.percentOfDirectCost },
    contingency: { percentOfDirectCost: plain.contingency.percentOfDirectCost },
    consumables: {
      enabled: plain.consumables.enabled,
      percentOfLaborCost: plain.consumables.percentOfLaborCost,
    },
    tax: plain.tax,
    mobilization: plain.mobilization,
    labor: {
      manufacturerHoursMultiplier: plain.labor.manufacturerHoursMultiplier,
      productiveHoursPerCrewDay: plain.labor.productiveHoursPerCrewDay,
    },
    concrete: plain.concrete,
  };
}
