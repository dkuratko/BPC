import { crud } from "@/lib/crud";
import { Customer } from "@/models";

const handlers = crud({
  model: Customer,
  searchFields: ["companyName"],
  filterFields: ["jobType"],
  defaultSort: { companyName: 1 },
  populate: [],
});

export const GET = handlers.list;
export const POST = handlers.create;
