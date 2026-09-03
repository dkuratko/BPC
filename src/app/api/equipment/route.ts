import { crud } from "@/lib/crud";
import { Equipment } from "@/models";

const handlers = crud({
  model: Equipment,
  searchFields: ["name", "makeModel"],
  filterFields: ["type", "ownership"],
  defaultSort: { name: 1 },
  populate: [],
});

export const GET = handlers.list;
export const POST = handlers.create;
