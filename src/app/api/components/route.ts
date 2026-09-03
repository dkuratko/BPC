import { crud } from "@/lib/crud";
import { PGComponent } from "@/models";

const handlers = crud({
  model: PGComponent,
  searchFields: ["name", "partNumber", "description"],
  filterFields: ["manufacturerId", "category"],
  defaultSort: { partNumber: 1 },
  populate: ["manufacturerId"],
});

export const GET = handlers.list;
export const POST = handlers.create;
