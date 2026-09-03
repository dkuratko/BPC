import { Schema, Types } from "mongoose";
import { defineModel, baseOptions, AddressSchema } from "@/lib/defineModel";

import { JOB_TYPES, SIZE_BANDS, JOB_TYPE_LABELS, type JobType, type SizeBand } from "@/lib/enums";
export { JOB_TYPES, SIZE_BANDS, JOB_TYPE_LABELS };
export type { JobType, SizeBand };

/**
 * Org-wide estimating defaults. A single document (key: "default").
 *
 * Everything here is a *default* that an individual estimate can override; the
 * estimate then snapshots whatever it actually used, so editing these values
 * never rewrites history.
 */

const MarginSetSchema = new Schema(
  {
    minimumPct: { type: Number, required: true },
    competitivePct: { type: Number, required: true },
    targetPct: { type: Number, required: true },
  },
  { _id: false },
);

const MarginPresetSchema = new Schema(
  {
    jobType: { type: String, enum: JOB_TYPES, required: true },
    sizeBand: { type: String, enum: SIZE_BANDS, required: true },
    margins: { type: MarginSetSchema, required: true },
    note: String,
  },
  { _id: false },
);

const SettingsSchema = new Schema(
  {
    key: { type: String, default: "default", unique: true, index: true },

    company: {
      name: { type: String, default: "Build Play Contracting" },
      address: { type: AddressSchema, default: () => ({ state: "AZ" }) },
      phone: String,
      email: String,
      licenseNumber: String,
      /** Free text printed under the total on customer-facing estimates. */
      estimateFooter: {
        type: String,
        default: "This estimate is valid for 30 days from the date issued.",
      },
    },

    pricing: {
      /**
       * Three prices are quoted off the same cost: the floor you will not go
       * below, a competitive number for a fought-over bid, and the number you
       * actually want. All are gross margins (cost / (1 - margin)), not markups.
       */
      defaultMargins: {
        type: MarginSetSchema,
        default: () => ({ minimumPct: 30, competitivePct: 33, targetPct: 38 }),
      },
      /** Per job-type / size-band overrides, matched most-specific-first. */
      marginPresets: { type: [MarginPresetSchema], default: [] },
      /** Direct-cost thresholds that classify a job as small / medium / large. */
      sizeBandThresholds: {
        smallMaxDirectCostCents: { type: Number, default: 1_500_000 },   // <= $15,000
        mediumMaxDirectCostCents: { type: Number, default: 7_500_000 },  // <= $75,000
      },
      /** Refuse to mark an estimate "sent" below this margin without an admin override. */
      hardFloorMarginPct: { type: Number, default: 30 },
    },

    /**
     * Overhead is the cost of being in business on a day when no shovel moves:
     * office rent, insurance, the truck payment on the F450 when it is parked,
     * accounting, software, your own non-field time, advertising. It is NOT
     * job labor, job materials, rentals for a job, or the crew's burden -- those
     * are direct costs and are estimated line by line.
     *
     * Applied here as a percentage of direct cost. To size it: annual overhead
     * dollars / annual direct-cost dollars. If you do not know it yet, 10-15%
     * is a common small-contractor starting point; the jobs collection will
     * eventually tell you the real number.
     */
    overhead: {
      percentOfDirectCost: { type: Number, default: 12 },
      note: String,
    },

    /** Applied after overhead, on direct cost, for the things that go wrong. */
    contingency: {
      percentOfDirectCost: { type: Number, default: 5 },
      note: String,
    },

    /**
     * Small materials nobody itemises: blades, bits, string line, marking paint,
     * fasteners, blocking, zip ties, drill batteries, broken bit replacements,
     * water, ice. Charged as a percentage of labor cost because consumable burn
     * tracks crew-hours far better than it tracks job dollars.
     */
    consumables: {
      enabled: { type: Boolean, default: true },
      percentOfLaborCost: { type: Number, default: 3 },
      note: String,
    },

    /**
     * Arizona TPT on materials. Build Play pays it at purchase; it is a cost,
     * not a line the customer sees. Rate varies by city -- 8.6% is a Phoenix
     * metro placeholder, confirm against your actual purchase locations.
     */
    tax: {
      materialSalesTaxPct: { type: Number, default: 8.6 },
      applyToMaterials: { type: Boolean, default: true },
      applyToRentals: { type: Boolean, default: true },
      showOnEstimate: { type: Boolean, default: false },
      note: String,
    },

    /**
     * Mobilization covers getting people and iron to the site and home again.
     * Charged as the greater of a minimum and the sum of its parts:
     *   distance  = roundTripMiles x perMileCents x trips
     *   weight    = trips implied by what has to be hauled vs trailer capacity
     *   crew      = travel hours x crew size x burdened labor rate
     */
    mobilization: {
      minimumChargeCents: { type: Number, default: 35_000 },   // $350
      perMileCents: { type: Number, default: 285 },            // $2.85/mi
      roundTrip: { type: Boolean, default: true },
      /** Hauling capacity of the 20 ft trailer behind the F450, in pounds. */
      trailerCapacityLb: { type: Number, default: 7_000 },
      /** Surcharge per 1,000 lb hauled, on top of the per-mile charge. */
      perThousandLbCents: { type: Number, default: 1_200 },    // $12 per 1,000 lb
      /** Crew travel time is paid, and is charged here rather than in job labor. */
      chargeCrewTravelTime: { type: Boolean, default: true },
      averageSpeedMph: { type: Number, default: 40 },
      /** Fixed load/unload time added to each trip, in hours. */
      loadUnloadHoursPerTrip: { type: Number, default: 0.75 },
    },

    labor: {
      /**
       * Burden percentages applied on top of base wage to get a fully burdened
       * cost. Defaults are ballpark figures for AZ construction -- replace them
       * with your actual payroll and workers-comp numbers.
       *
       * overheadAllocationPct defaults to 0 on purpose: overhead is already
       * applied once as a percentage of direct cost above. Putting it in both
       * places charges it twice.
       */
      defaultBurden: {
        payrollTaxPct: { type: Number, default: 9.5 },     // FICA 7.65 + FUTA/SUTA
        workersCompPct: { type: Number, default: 10 },     // AZ construction class
        benefitsPct: { type: Number, default: 5 },
        otherPct: { type: Number, default: 2 },            // PPE, training, phone
        overheadAllocationPct: { type: Number, default: 0 },
      },
      /**
       * Manufacturer-published install hours are a clean baseline but assume
       * ideal conditions. This multiplier is applied to them before site factors.
       */
      manufacturerHoursMultiplier: { type: Number, default: 1.15 },
      productiveHoursPerCrewDay: { type: Number, default: 8 },
    },

    /**
     * Small pours get hand-mixed from bags; larger ones get a ready-mix truck.
     * The engine picks based on the threshold and says which one it chose.
     */
    concrete: {
      baggedMaxCuYd: { type: Number, default: 1.5 },
      wasteFactorPct: { type: Number, default: 10 },
      defaultBagWeightLb: { type: Number, default: 80 },
      handMixLaborHoursPerCuYd: { type: Number, default: 2.5 },
      readyMixLaborHoursPerCuYd: { type: Number, default: 0.75 },
    },

    /**
     * Until a component has been installed enough times to have real hours,
     * infer them from weight and category. Anything inferred is flagged on the
     * estimate so you know which numbers are guesses.
     */
    componentLaborInference: {
      enabled: { type: Boolean, default: true },
      defaultHoursPer100Lb: { type: Number, default: 1.0 },
      byCategory: {
        type: [
          new Schema(
            {
              category: { type: String, required: true },
              hoursPer100Lb: { type: Number, required: true },
              footingsPer100Lb: { type: Number, default: 0 },
              note: String,
            },
            { _id: false },
          ),
        ],
        default: [],
      },
    },

    estimateNumber: {
      prefix: { type: String, default: "BPC-E" },
      /** BPC-E26-42 => prefix + 2-digit year + "-" + sequence */
      sequencePadding: { type: Number, default: 0 },
    },

    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  baseOptions,
);

export type SettingsDoc = {
  _id: Types.ObjectId;
  key: string;
  company: {
    name: string;
    address?: { street?: string; city?: string; state?: string; zip?: string };
    phone?: string; email?: string; licenseNumber?: string; estimateFooter?: string;
  };
  pricing: {
    defaultMargins: { minimumPct: number; competitivePct: number; targetPct: number };
    marginPresets: Array<{
      jobType: JobType; sizeBand: SizeBand;
      margins: { minimumPct: number; competitivePct: number; targetPct: number };
      note?: string;
    }>;
    sizeBandThresholds: { smallMaxDirectCostCents: number; mediumMaxDirectCostCents: number };
    hardFloorMarginPct: number;
  };
  overhead: { percentOfDirectCost: number; note?: string };
  contingency: { percentOfDirectCost: number; note?: string };
  consumables: { enabled: boolean; percentOfLaborCost: number; note?: string };
  tax: {
    materialSalesTaxPct: number; applyToMaterials: boolean;
    applyToRentals: boolean; showOnEstimate: boolean; note?: string;
  };
  mobilization: {
    minimumChargeCents: number; perMileCents: number; roundTrip: boolean;
    trailerCapacityLb: number; perThousandLbCents: number;
    chargeCrewTravelTime: boolean; averageSpeedMph: number; loadUnloadHoursPerTrip: number;
  };
  labor: {
    defaultBurden: {
      payrollTaxPct: number; workersCompPct: number; benefitsPct: number;
      otherPct: number; overheadAllocationPct: number;
    };
    manufacturerHoursMultiplier: number;
    productiveHoursPerCrewDay: number;
  };
  concrete: {
    baggedMaxCuYd: number; wasteFactorPct: number; defaultBagWeightLb: number;
    handMixLaborHoursPerCuYd: number; readyMixLaborHoursPerCuYd: number;
  };
  componentLaborInference: {
    enabled: boolean; defaultHoursPer100Lb: number;
    byCategory: Array<{ category: string; hoursPer100Lb: number; footingsPer100Lb: number; note?: string }>;
  };
  estimateNumber: { prefix: string; sequencePadding: number };
  createdAt: Date;
  updatedAt: Date;
};

export const Settings = defineModel<SettingsDoc>("Settings", SettingsSchema);
