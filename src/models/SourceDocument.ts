import { Schema, Types } from "mongoose";
import { defineModel, baseOptions } from "@/lib/defineModel";

/**
 * The original manufacturer quote or plan set. The parsed values are a
 * convenience; the file itself is the record, so it is kept and pointed at
 * rather than thrown away once numbers have been lifted out of it.
 */
export interface SourceDocumentDoc {
  _id: Types.ObjectId;
  projectId?: Types.ObjectId | null;
  manufacturerId?: Types.ObjectId | null;
  documentType: "manufacturer_quote" | "plan" | "specification" | "email" | "photo" | "other";
  fileName: string;
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
  parser: {
    parserType?: string;
    parsedAt?: Date | null;
    parserVersion?: string;
    status: "pending" | "parsed" | "failed" | "review_required" | "not_attempted";
    message?: string;
  };
  /** Whatever the parser pulled out, unopinionated. */
  sourceData?: unknown;
  uploadedBy?: Types.ObjectId | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const SourceDocumentSchema = new Schema(
  {
    projectId: { type: Schema.Types.ObjectId, ref: "Project", index: true, default: null },
    manufacturerId: { type: Schema.Types.ObjectId, ref: "Manufacturer", default: null },
    documentType: {
      type: String,
      enum: ["manufacturer_quote", "plan", "specification", "email", "photo", "other"],
      default: "manufacturer_quote",
    },
    fileName: { type: String, required: true },
    storagePath: { type: String, required: true },
    mimeType: String,
    sizeBytes: Number,
    parser: {
      parserType: String,
      parsedAt: { type: Date, default: null },
      parserVersion: String,
      status: {
        type: String,
        enum: ["pending", "parsed", "failed", "review_required", "not_attempted"],
        default: "not_attempted",
      },
      message: String,
    },
    sourceData: { type: Schema.Types.Mixed },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    active: { type: Boolean, default: true },
  },
  baseOptions,
);

export const SourceDocument = defineModel<SourceDocumentDoc>("SourceDocument", SourceDocumentSchema);
