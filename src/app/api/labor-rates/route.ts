import { crud } from "@/lib/crud";
import { LaborRate } from "@/models";

const handlers = crud({
  model: LaborRate,
  searchFields: ["name"],
  filterFields: ["type"],
  defaultSort: { name: 1 },
  populate: [],
});

export const GET = handlers.list;
export const POST = handlers.create;
