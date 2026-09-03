import { z } from "zod";
import { connectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { Estimate } from "@/models";
import { saveEstimate, type EstimateRecipe } from "@/services/estimateService";

export async function GET(request: Request) {
  try {
    await connectDb();
    await requireRole("viewer");
    const url = new URL(request.url);
    const query: Record<string, unknown> = {};
    const projectId = url.searchParams.get("projectId");
    const status = url.searchParams.get("status");
    if (projectId) query.projectId = projectId;
    if (status) query.status = status;

    const items = await Estimate.find(query).sort({ createdAt: -1 }).limit(200).populate("projectId");
    return ok({ items, total: items.length });
  } catch (err) {
    return errorResponse(err);
  }
}

const SaveSchema = z.object({
  projectId: z.string().min(1),
  estimateId: z.string().optional(),
  recipe: z.record(z.unknown()),
});

export async function POST(request: Request) {
  try {
    await connectDb();
    const session = await requireRole("estimator");
    const { projectId, estimateId, recipe } = SaveSchema.parse(await request.json());
    const estimate = await saveEstimate(projectId, recipe as unknown as EstimateRecipe, {
      estimateId,
      userId: session.userId,
    });
    return ok(estimate, estimateId ? 200 : 201);
  } catch (err) {
    return errorResponse(err);
  }
}
