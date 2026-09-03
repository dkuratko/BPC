import { crud } from "@/lib/crud";
import { SubcontractorRate } from "@/models";

const handlers = crud({
  model: SubcontractorRate,
  populate: ["vendorId"],
});

export const GET = handlers.read;
export const PATCH = handlers.update;
export const PUT = handlers.update;
export const DELETE = handlers.remove;
