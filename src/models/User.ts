import { Schema, Types } from "mongoose";
import { defineModel, baseOptions } from "@/lib/defineModel";

import { ROLES, type Role } from "@/lib/enums";
export { ROLES };
export type { Role };

/**
 * admin     - everything, including rates, rules, margins and user management
 * estimator - create/edit projects and estimates, read master data
 * viewer    - read only
 */
export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: "estimator" },
    active: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
  },
  baseOptions,
);

// Never let a password hash reach a client, even if a caller forgets .select().
UserSchema.set("toJSON", {
  virtuals: true,
  versionKey: false,
  transform(_doc, ret: Record<string, unknown>) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.passwordHash;
    return ret;
  },
});

export const User = defineModel<UserDoc>("User", UserSchema);
