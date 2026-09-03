import { crud } from "@/lib/crud";
import { Material } from "@/models";

const handlers = crud({
  model: Material,
  populate: [],
});

export const GET = handlers.read;
export const PATCH = handlers.update;
export const PUT = handlers.update;
export const DELETE = handlers.remove;
