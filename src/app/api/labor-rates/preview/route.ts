import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { computeBurdenedRate } from "@/services/laborBurdenService";

const PreviewSchema = z.object({
  baseWageCents: z.number().nonnegative(),
  burden: z.object({
    payrollTaxPct: z.number().default(0),
    workersCompPct: z.number().default(0),
    benefitsPct: z.number().default(0),
    otherPct: z.number().default(0),
    overheadAllocationPct: z.number().default(0),
  }),
  crewSize: z.number().min(1).default(1),
});

/** Live "what does an hour actually cost" preview for the labor rate screen. */
export async function POST(request: Request) {
  try {
    await requireRole("viewer");
    const { baseWageCents, burden, crewSize } = PreviewSchema.parse(await request.json());
    const result = computeBurdenedRate(baseWageCents, burden);
    return ok({ ...result, crewSize, crewHourlyCents: result.fullyBurdenedCents * crewSize });
  } catch (err) {
    return errorResponse(err);
  }
}
