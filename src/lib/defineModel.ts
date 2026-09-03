import mongoose, { Schema, Model } from "mongoose";

/**
 * Next.js re-evaluates modules on hot reload; re-registering a model throws
 * OverwriteModelError. Reuse the already-compiled model when it exists.
 */
export function defineModel<T>(name: string, schema: Schema): Model<T> {
  // The casts are deliberate. Letting mongoose infer a document type from the
  // schema literal and then reconcile it with T sends tsc into a type-inference
  // blow-up that takes minutes per file; the hand-written interfaces above each
  // schema are the contract instead.
  return (
    (mongoose.models[name] as unknown as Model<T>) ??
    (mongoose.model(name, schema) as unknown as Model<T>)
  );
}

/** Common options: timestamps everywhere, and lean JSON that the UI can consume. */
export const baseOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform(_doc: unknown, ret: Record<string, unknown>) {
      ret.id = String(ret._id);
      delete ret._id;
      return ret;
    },
  },
} as const;

/** An address sub-document, reused by vendors, customers and projects. */
export const AddressSchema = new Schema(
  {
    street: String,
    city: String,
    state: { type: String, default: "AZ" },
    zip: String,
  },
  { _id: false },
);

export const ContactSchema = new Schema(
  {
    name: String,
    title: String,
    email: String,
    phone: String,
    primary: { type: Boolean, default: false },
  },
  { _id: false },
);

/** A dated price window. Rates are never edited in place -- a new row supersedes
 *  the old one so historical estimates stay reproducible. */
export const effectiveDating = {
  effectiveDate: { type: Date, required: true, default: () => new Date() },
  expirationDate: { type: Date, default: null },
};
