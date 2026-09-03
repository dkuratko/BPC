import { crud } from "@/lib/crud";
import { Equipment } from "@/models";

const handlers = crud({
  model: Equipment,
  populate: [],
});

export const GET = handlers.read;
export const PATCH = handlers.update;
export const PUT = handlers.update;
export const DELETE = handlers.remove;
