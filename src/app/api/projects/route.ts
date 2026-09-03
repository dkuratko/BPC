import { crud } from "@/lib/crud";
import { Project } from "@/models";

const handlers = crud({
  model: Project,
  searchFields: ["name"],
  filterFields: ["status", "jobType", "customerId"],
  defaultSort: { createdAt: -1 },
  populate: ["customerId"],
});

export const GET = handlers.list;
export const POST = handlers.create;
