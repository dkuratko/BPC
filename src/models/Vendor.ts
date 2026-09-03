import { Schema, Types } from "mongoose";
import { defineModel, baseOptions, AddressSchema, ContactSchema } from "@/lib/defineModel";

import { VENDOR_TYPES, type VendorType } from "@/lib/enums";
export { VENDOR_TYPES };
export type { VendorType };

export interface VendorDoc {
  _id: Types.ObjectId;
  name: string;
  types: VendorType[];
  accountNumber?: string;
  contacts: Array<{ name?: string; title?: string; email?: string; phone?: string; primary?: boolean }>;
  address?: { street?: string; city?: string; state?: string; zip?: string };
  /** Distance from the yard, used to sanity-check delivery/pickup fees. */
  notes?: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const VendorSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    /** A vendor can be more than one thing -- Sunstate rents and sells. */
    types: { type: [{ type: String, enum: VENDOR_TYPES }], default: ["rental"] },
    accountNumber: String,
    contacts: { type: [ContactSchema], default: [] },
    address: { type: AddressSchema, default: () => ({ state: "AZ" }) },
    notes: String,
    active: { type: Boolean, default: true },
  },
  baseOptions,
);

export const Vendor = defineModel<VendorDoc>("Vendor", VendorSchema);
