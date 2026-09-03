import { connectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { getSettings } from "@/services/settingsService";

export async function GET() {
  try {
    await connectDb();
    await requireRole("viewer");
    return ok(await getSettings());
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    await connectDb();
    // Margins, overhead and burden move every price in the system: admin only.
    const session = await requireRole("admin");
    const settings = await getSettings();
    const body = await request.json();
    settings.set({ ...body, key: "default", updatedBy: session.userId });
    await settings.save();
    return ok(settings);
  } catch (err) {
    return errorResponse(err);
  }
}
