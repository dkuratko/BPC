import { crud } from "@/lib/crud";
import { Material } from "@/models";

const handlers = crud({
  model: Material,
  searchFields: ["name"],
  filterFields: ["category", "concreteRole"],
  defaultSort: { name: 1 },
  populate: [],
});

export const GET = handlers.list;
export const POST = handlers.create;
