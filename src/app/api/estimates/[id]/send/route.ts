import { connectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse, fail, ok } from "@/lib/api";
import { Estimate } from "@/models";
import { getSettings } from "@/services/settingsService";
import { markEstimateSent } from "@/services/estimateService";

/**
 * Marking an estimate sent freezes it. Below-floor margins need an admin, so a
 * price that loses money cannot leave the building on an estimator's say-so.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    const session = await requireRole("estimator");
    const { id } = await ctx.params;

    const estimate = await Estimate.findById(id);
    if (!estimate) return fail("Not found.", 404);

    const settings = await getSettings();
    const floor = settings.pricing.hardFloorMarginPct;
    if (estimate.pricing.realizedMarginPct < floor && session.role !== "admin") {
      return fail(
        `${estimate.estimateNumber} prices at a ${estimate.pricing.realizedMarginPct}% gross margin, below the ` +
          `${floor}% floor. An admin has to send this one.`,
        403,
      );
    }
    void request;
    return ok(await markEstimateSent(id));
  } catch (err) {
    return errorResponse(err);
  }
}
