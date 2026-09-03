import { connectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse, fail, ok } from "@/lib/api";
import { Estimate, EstimateLineItem, LOCKED_STATUSES } from "@/models";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    await requireRole("viewer");
    const { id } = await ctx.params;
    const estimate = await Estimate.findById(id).populate("projectId");
    if (!estimate) return fail("Not found.", 404);
    const lineItems = await EstimateLineItem.find({ estimateId: estimate._id }).sort({ category: 1, sortOrder: 1 });
    return ok({ estimate, lineItems });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Only status, notes and exclusions are editable here; numbers come from a recalculation. */
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    await requireRole("estimator");
    const { id } = await ctx.params;
    const estimate = await Estimate.findById(id);
    if (!estimate) return fail("Not found.", 404);

    const body = await request.json();
    const allowed = ["notes", "exclusions", "assumptions", "status"] as const;
    for (const key of allowed) {
      if (key in body) {
        if (key === "status" && LOCKED_STATUSES.includes(estimate.status) && body.status === "draft") {
          return fail("A sent estimate cannot be put back into draft. Create a revision instead.", 409);
        }
        (estimate as unknown as Record<string, unknown>)[key] = body[key];
      }
    }
    if (body.status === "accepted" || body.status === "rejected") estimate.decidedAt = new Date();
    await estimate.save();
    return ok(estimate);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    await requireRole("admin");
    const { id } = await ctx.params;
    const estimate = await Estimate.findById(id);
    if (!estimate) return fail("Not found.", 404);
    if (LOCKED_STATUSES.includes(estimate.status)) {
      return fail("Sent estimates are part of the record and cannot be deleted.", 409);
    }
    await EstimateLineItem.deleteMany({ estimateId: estimate._id });
    await estimate.deleteOne();
    return ok({ deleted: true, id });
  } catch (err) {
    return errorResponse(err);
  }
}
