import { Schema, Types } from "mongoose";
import { defineModel, baseOptions, AddressSchema } from "@/lib/defineModel";
import { JOB_TYPES, type JobType } from "./Settings";

import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from "@/lib/enums";
export { PROJECT_STATUSES, PROJECT_STATUS_LABELS };
export type { ProjectStatus };

export interface ProjectDoc {
  _id: Types.ObjectId;
  customerId: Types.ObjectId;
  name: string;
  jobType: JobType;
  location: {
    address?: { street?: string; city?: string; state?: string; zip?: string };
    latitude?: number;
    longitude?: number;
    /** One-way miles from the yard. Drives the mobilization charge. */
    milesFromYard?: number;
  };
  playground: {
    sourceType: "custom" | "preset" | "unknown";
    ageRange?: string;
    manufacturerId?: Types.ObjectId | null;
    assemblyId?: Types.ObjectId | null;
    /** Free text from the manufacturer quote (e.g. "PlayBooster 2-12"). */
    modelDescription?: string;
  };
  site: {
    /** Ratings against the SiteFactor catalogue: 1 ideal, 5 standard, 10 worst. */
    ratings: Array<{ factorKey: string; rating: number; note?: string }>;
    soilDescription?: string;
    existingSurface?: string;
    utilitiesLocated?: boolean;
    waterOnSite?: boolean;
    powerOnSite?: boolean;
    workHoursRestriction?: string;
    notes?: string;
  };
  scope: {
    playgroundInstallation: boolean;
    excavation: boolean;
    concrete: boolean;
    surfacing: boolean;
    demolition: boolean;
    disposal: boolean;
    curbing: boolean;
    shade: boolean;
    other: string[];
  };
  status: ProjectStatus;
  targetStartDate?: Date | null;
  notes?: string;
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    name: { type: String, required: true, trim: true },
    jobType: { type: String, enum: JOB_TYPES, default: "other", index: true },
    location: {
      address: { type: AddressSchema, default: () => ({ state: "AZ" }) },
      latitude: Number,
      longitude: Number,
      milesFromYard: { type: Number, default: 0 },
    },
    playground: {
      sourceType: { type: String, enum: ["custom", "preset", "unknown"], default: "unknown" },
      ageRange: String,
      manufacturerId: { type: Schema.Types.ObjectId, ref: "Manufacturer", default: null },
      assemblyId: { type: Schema.Types.ObjectId, ref: "PGAssembly", default: null },
      modelDescription: String,
    },
    site: {
      ratings: {
        type: [
          new Schema(
            { factorKey: { type: String, required: true }, rating: { type: Number, required: true }, note: String },
            { _id: false },
          ),
        ],
        default: [],
      },
      soilDescription: String,
      existingSurface: String,
      utilitiesLocated: { type: Boolean, default: false },
      waterOnSite: { type: Boolean, default: true },
      powerOnSite: { type: Boolean, default: true },
      workHoursRestriction: String,
      notes: String,
    },
    scope: {
      playgroundInstallation: { type: Boolean, default: true },
      excavation: { type: Boolean, default: false },
      concrete: { type: Boolean, default: true },
      surfacing: { type: Boolean, default: false },
      demolition: { type: Boolean, default: false },
      disposal: { type: Boolean, default: false },
      curbing: { type: Boolean, default: false },
      shade: { type: Boolean, default: false },
      other: { type: [String], default: [] },
    },
    status: { type: String, enum: PROJECT_STATUSES, default: "estimating", index: true },
    targetStartDate: { type: Date, default: null },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  baseOptions,
);

export const Project = defineModel<ProjectDoc>("Project", ProjectSchema);
