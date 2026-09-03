import { Schema, Types } from "mongoose";
import { defineModel, baseOptions, AddressSchema, ContactSchema } from "@/lib/defineModel";
import { JOB_TYPES, type JobType } from "./Settings";

export interface CustomerDoc {
  _id: Types.ObjectId;
  companyName: string;
  /** Drives the default margin preset for projects under this customer. */
  jobType: JobType;
  contacts: Array<{ name?: string; title?: string; email?: string; phone?: string; primary?: boolean }>;
  billingAddress?: { street?: string; city?: string; state?: string; zip?: string };
  taxExempt: boolean;
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema(
  {
    companyName: { type: String, required: true, trim: true, index: true },
    jobType: { type: String, enum: JOB_TYPES, default: "other", index: true },
    contacts: { type: [ContactSchema], default: [] },
    billingAddress: { type: AddressSchema, default: () => ({ state: "AZ" }) },
    /** Schools and municipalities are often exempt; affects material tax cost. */
    taxExempt: { type: Boolean, default: false },
    notes: String,
    active: { type: Boolean, default: true },
  },
  baseOptions,
);

export const Customer = defineModel<CustomerDoc>("Customer", CustomerSchema);
