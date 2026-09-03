import { round } from "@/lib/money";
import type { EngineSettings } from "./types";

/**
 * Getting people and iron to the site and home again.
 *
 * Three things drive it: how far it is, how much has to be hauled (which
 * decides how many trips the F450 and the 20 ft trailer have to make), and the
 * crew's paid travel time. Travel is charged here rather than inside job labor
 * so that a job's labor hours stay comparable between a site down the road and
 * one two hours out -- otherwise every variance report is polluted by drive time.
 *
 * The result is floored at a minimum charge, because a fifteen-minute drive
 * still costs a morning of getting loaded and unloaded.
 */

export interface MobilizationInput {
  milesFromYard: number;
  haulWeightLb: number;
  crewSize: number;
  fullyBurdenedCents: number;
  /** Site multiplier for the "mobilization" target. */
  siteMultiplier?: number;
}

export interface MobilizationResult {
  trips: number;
  oneWayMiles: number;
  milesPerTrip: number;
  totalMiles: number;
  haulWeightLb: number;
  distanceCents: number;
  weightCents: number;
  travelHours: number;
  crewTravelCents: number;
  subtotalCents: number;
  minimumChargeCents: number;
  minimumApplied: boolean;
  siteMultiplier: number;
  totalCents: number;
  explanation: string;
}

export function calculateMobilization(input: MobilizationInput, settings: EngineSettings): MobilizationResult {
  const m = settings.mobilization;
  const oneWayMiles = Math.max(input.milesFromYard, 0);
  const milesPerTrip = m.roundTrip ? oneWayMiles * 2 : oneWayMiles;

  // Anything over one trailer load means going back for the rest.
  const trips = Math.max(1, Math.ceil(input.haulWeightLb / Math.max(m.trailerCapacityLb, 1)));

  const totalMiles = round(milesPerTrip * trips, 1);
  const distanceCents = Math.round(totalMiles * m.perMileCents);
  const weightCents = Math.round((input.haulWeightLb / 1000) * m.perThousandLbCents);

  const drivingHours = m.averageSpeedMph > 0 ? milesPerTrip / m.averageSpeedMph : 0;
  const travelHours = round(trips * (drivingHours + m.loadUnloadHoursPerTrip), 2);
  const crewTravelCents = m.chargeCrewTravelTime
    ? Math.round(travelHours * Math.max(input.crewSize, 1) * input.fullyBurdenedCents)
    : 0;

  const subtotalCents = distanceCents + weightCents + crewTravelCents;
  const siteMultiplier = input.siteMultiplier ?? 1;
  const adjusted = Math.round(subtotalCents * siteMultiplier);
  const minimumApplied = adjusted < m.minimumChargeCents;
  const totalCents = Math.max(adjusted, m.minimumChargeCents);

  const parts = [
    `${trips} trip${trips === 1 ? "" : "s"} for ${Math.round(input.haulWeightLb).toLocaleString()} lb ` +
      `(${m.trailerCapacityLb.toLocaleString()} lb trailer capacity)`,
    `${totalMiles} mi total${m.roundTrip ? " (round trip)" : ""}`,
    m.chargeCrewTravelTime
      ? `${travelHours} hr travel and load/unload x ${input.crewSize} crew`
      : "crew travel time not charged here",
  ];
  const minNote = minimumApplied ? ` Floored at the ${(m.minimumChargeCents / 100).toFixed(2)} minimum charge.` : "";
  const siteNote = siteMultiplier !== 1 ? ` Site multiplier x${siteMultiplier}.` : "";

  return {
    trips, oneWayMiles, milesPerTrip, totalMiles,
    haulWeightLb: input.haulWeightLb,
    distanceCents, weightCents, travelHours, crewTravelCents,
    subtotalCents, minimumChargeCents: m.minimumChargeCents, minimumApplied,
    siteMultiplier, totalCents,
    explanation: `${parts.join("; ")}.${siteNote}${minNote}`,
  };
}
