import { crud } from "@/lib/crud";
import { Project } from "@/models";

const handlers = crud({
  model: Project,
  populate: ["customerId"],
});

export const GET = handlers.read;
export const PATCH = handlers.update;
export const PUT = handlers.update;
export const DELETE = handlers.remove;
