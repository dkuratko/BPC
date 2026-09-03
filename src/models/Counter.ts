import { Schema, Types } from "mongoose";
import { defineModel } from "@/lib/defineModel";

/** Atomic sequence source for human-readable document numbers (BPC-E26-42). */
export interface CounterDoc {
  _id: string; // e.g. "estimate:2026"
  seq: number;
}

const CounterSchema = new Schema({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

export const Counter = defineModel<CounterDoc>("Counter", CounterSchema);
