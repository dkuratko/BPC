import { connectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse, fail, ok } from "@/lib/api";
import {
  ASSEMBLY_CSV_HEADERS, COMPONENT_CSV_HEADERS, csvTemplate,
  importAssemblies, importComponents,
} from "@/services/csvImportService";

/** GET returns a blank template so the user can see the expected columns. */
export async function GET(request: Request) {
  try {
    await requireRole("viewer");
    const kind = new URL(request.url).searchParams.get("kind") ?? "components";
    const headers = kind === "assemblies" ? ASSEMBLY_CSV_HEADERS : COMPONENT_CSV_HEADERS;
    return new Response(csvTemplate(headers), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${kind}-template.csv"`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    await connectDb();
    await requireRole("estimator");

    const form = await request.formData();
    const file = form.get("file");
    const manufacturerId = String(form.get("manufacturerId") ?? "");
    const kind = String(form.get("kind") ?? "components");

    if (!manufacturerId) return fail("Choose a manufacturer for this import.", 400);
    if (!(file instanceof File)) return fail("Attach a CSV file.", 400);

    const text = await file.text();
    const result =
      kind === "assemblies"
        ? await importAssemblies(text, manufacturerId)
        : await importComponents(text, manufacturerId);

    return ok(result);
  } catch (err) {
    return errorResponse(err);
  }
}
