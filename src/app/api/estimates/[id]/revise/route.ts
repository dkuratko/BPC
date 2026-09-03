import { connectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { reviseEstimate } from "@/services/estimateService";

/** Fork a sent estimate into a new version, recalculated against today's rates. */
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    const session = await requireRole("estimator");
    const { id } = await ctx.params;
    return ok(await reviseEstimate(id, session.userId), 201);
  } catch (err) {
    return errorResponse(err);
  }
}
