import { crud } from "@/lib/crud";
import { Manufacturer } from "@/models";

const handlers = crud({
  model: Manufacturer,
  searchFields: ["name"],
  filterFields: [],
  defaultSort: { name: 1 },
  populate: [],
});

export const GET = handlers.list;
export const POST = handlers.create;
