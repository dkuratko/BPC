import { crud } from "@/lib/crud";
import { EstimatingRule } from "@/models";

const handlers = crud({
  model: EstimatingRule,
  searchFields: ["name"],
  filterFields: ["type"],
  defaultSort: { priority: 1 },
  populate: [],
});

export const GET = handlers.list;
export const POST = handlers.create;
