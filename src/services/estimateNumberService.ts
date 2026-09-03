import { connectDb } from "@/lib/db";
import { Counter } from "@/models/Counter";

/**
 * Estimate numbers read BPC-E26-42: prefix, two-digit year, sequence.
 * A revision keeps its parent's number and gains a suffix -- BPC-E26-42-R2 --
 * so that a customer holding the first sheet can still be talked to about it.
 */
export async function nextEstimateNumber(
  prefix = "BPC-E",
  padding = 0,
  now = new Date(),
): Promise<string> {
  await connectDb();
  const year = now.getFullYear();
  const yy = String(year).slice(-2);

  const counter = await Counter.findByIdAndUpdate(
    `estimate:${year}`,
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  );

  const seq = counter?.seq ?? 1;
  return `${prefix}${yy}-${padding > 0 ? String(seq).padStart(padding, "0") : seq}`;
}

export function revisionNumber(baseNumber: string, version: number): string {
  if (version <= 1) return baseNumber;
  const root = baseNumber.replace(/-R\d+$/, "");
  return `${root}-R${version}`;
}
