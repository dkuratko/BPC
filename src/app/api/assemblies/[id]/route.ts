import { crud } from "@/lib/crud";
import { PGAssembly } from "@/models";

const handlers = crud({
  model: PGAssembly,
  populate: ["manufacturerId"],
});

export const GET = handlers.read;
export const PATCH = handlers.update;
export const PUT = handlers.update;
export const DELETE = handlers.remove;
