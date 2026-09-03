import { crud } from "@/lib/crud";
import { Vendor } from "@/models";

const handlers = crud({
  model: Vendor,
  searchFields: ["name", "accountNumber"],
  filterFields: ["types"],
  defaultSort: { name: 1 },
  populate: [],
});

export const GET = handlers.list;
export const POST = handlers.create;
