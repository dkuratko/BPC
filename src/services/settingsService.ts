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

/** Narrow the settings document to just what the engine reads. */
export function toEngineSettings(settings: SettingsDoc | HydratedDocument<SettingsDoc>): EngineSettings {
  return {
    pricing: {
      defaultMargins: settings.pricing.defaultMargins,
      marginPresets: settings.pricing.marginPresets,
      sizeBandThresholds: settings.pricing.sizeBandThresholds,
      hardFloorMarginPct: settings.pricing.hardFloorMarginPct,
    },
    overhead: { percentOfDirectCost: settings.overhead.percentOfDirectCost },
    contingency: { percentOfDirectCost: settings.contingency.percentOfDirectCost },
    consumables: {
      enabled: settings.consumables.enabled,
      percentOfLaborCost: settings.consumables.percentOfLaborCost,
    },
    tax: settings.tax,
    mobilization: settings.mobilization,
    labor: {
      manufacturerHoursMultiplier: settings.labor.manufacturerHoursMultiplier,
      productiveHoursPerCrewDay: settings.labor.productiveHoursPerCrewDay,
    },
    concrete: settings.concrete,
  };
}
