import { Schema, Types } from "mongoose";
import { defineModel, baseOptions } from "@/lib/defineModel";

export interface ManufacturerDoc {
  _id: Types.ObjectId;
  name: string;
  website?: string;
  productLines: string[];
  documentConventions: { quoteFormat?: string; parserType?: string; notes?: string };
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ManufacturerSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    website: String,
    productLines: { type: [String], default: [] },
    documentConventions: {
      /** How their quotes are laid out, so a parser can be chosen per manufacturer. */
      quoteFormat: String,
      parserType: { type: String, default: "generic" },
      notes: String,
    },
    active: { type: Boolean, default: true },
  },
  baseOptions,
);

export const Manufacturer = defineModel<ManufacturerDoc>("Manufacturer", ManufacturerSchema);
