import { crud } from "@/lib/crud";
import { PGAssembly } from "@/models";

const handlers = crud({
  model: PGAssembly,
  searchFields: ["name", "modelNumber"],
  filterFields: ["manufacturerId"],
  defaultSort: { modelNumber: 1 },
  populate: ["manufacturerId"],
});

export const GET = handlers.list;
export const POST = handlers.create;
