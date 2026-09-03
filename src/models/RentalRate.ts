import { Schema, Types } from "mongoose";
import { defineModel, baseOptions, effectiveDating, AddressSchema } from "@/lib/defineModel";

/**
 * One vendor's price for one piece of equipment at one point in time.
 *
 * Several vendors can carry the same machine; the engine compares them and
 * picks the cheapest for the required duration, including fees. The comparison
 * is internal -- the customer never sees which yard the telehandler came from.
 */
export interface RentalRateDoc {
  _id: Types.ObjectId;
  equipmentId: Types.ObjectId;
  vendorId: Types.ObjectId;
  location?: { street?: string; city?: string; state?: string; zip?: string };
  rates: { hourlyCents?: number; dailyCents?: number; weeklyCents?: number; monthlyCents?: number };
  fees: {
    deliveryCents?: number; pickupCents?: number; cleaningCents?: number;
    environmentalPct?: number; damageWaiverPct?: number; otherCents?: number; otherNote?: string;
  };
  fuelIncluded: boolean;
  minimumRental: { quantity?: number; unit?: "hour" | "day" | "week" };
  quoteReference?: string;
  effectiveDate: Date;
  expirationDate?: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RentalRateSchema = new Schema(
  {
    equipmentId: { type: Schema.Types.ObjectId, ref: "Equipment", required: true, index: true },
    vendorId: { type: Schema.Types.ObjectId, ref: "Vendor", required: true, index: true },
    location: { type: AddressSchema, default: () => ({ state: "AZ" }) },
    rates: {
      hourlyCents: Number,
      dailyCents: Number,
      weeklyCents: Number,
      monthlyCents: Number,
    },
    fees: {
      deliveryCents: { type: Number, default: 0 },
      pickupCents: { type: Number, default: 0 },
      cleaningCents: { type: Number, default: 0 },
      /** Environmental and damage waiver are charged as a % of the rental. */
      environmentalPct: { type: Number, default: 0 },
      damageWaiverPct: { type: Number, default: 0 },
      otherCents: { type: Number, default: 0 },
      otherNote: String,
    },
    fuelIncluded: { type: Boolean, default: false },
    minimumRental: {
      quantity: { type: Number, default: 1 },
      unit: { type: String, enum: ["hour", "day", "week"], default: "day" },
    },
    quoteReference: String,
    ...effectiveDating,
    active: { type: Boolean, default: true },
  },
  baseOptions,
);

RentalRateSchema.index({ equipmentId: 1, vendorId: 1, effectiveDate: -1 });

export const RentalRate = defineModel<RentalRateDoc>("RentalRate", RentalRateSchema);
