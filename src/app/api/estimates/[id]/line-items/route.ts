import { connectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { EstimateLineItem } from "@/models";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    await requireRole("viewer");
    const { id } = await ctx.params;
    const items = await EstimateLineItem.find({ estimateId: id }).sort({ category: 1, sortOrder: 1 });
    return ok({ items, total: items.length });
  } catch (err) {
    return errorResponse(err);
  }
}
