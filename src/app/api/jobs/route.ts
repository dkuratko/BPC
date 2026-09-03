import { crud } from "@/lib/crud";
import { Job } from "@/models";

const handlers = crud({
  model: Job,
  searchFields: [],
  filterFields: ["status", "projectId"],
  defaultSort: { createdAt: -1 },
  populate: ["projectId", "estimateId"],
});

export const GET = handlers.list;
export const POST = handlers.create;
