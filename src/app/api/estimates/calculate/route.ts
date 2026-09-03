import { z } from "zod";
import { connectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { calculateEstimate, type EstimateRecipe } from "@/services/estimateService";

const CalculateSchema = z.object({
  projectId: z.string().min(1),
  recipe: z.record(z.unknown()),
});

/**
 * Price a recipe without saving it. The estimate screen calls this on every
 * change so the estimator can see the number move as they work.
 */
export async function POST(request: Request) {
  try {
    await connectDb();
    await requireRole("viewer");
    const { projectId, recipe } = CalculateSchema.parse(await request.json());
    const result = await calculateEstimate(projectId, recipe as unknown as EstimateRecipe);
    return ok(result);
  } catch (err) {
    return errorResponse(err);
  }
}
