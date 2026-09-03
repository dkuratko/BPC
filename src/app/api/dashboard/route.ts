import { requireRole } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { getDashboard } from "@/services/dashboardService";

export async function GET() {
  try {
    await requireRole("viewer");
    return ok(await getDashboard());
  } catch (err) {
    return errorResponse(err);
  }
}
