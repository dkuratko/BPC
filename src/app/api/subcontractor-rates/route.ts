import { crud } from "@/lib/crud";
import { SubcontractorRate } from "@/models";

const handlers = crud({
  model: SubcontractorRate,
  searchFields: ["service"],
  filterFields: ["vendorId", "category"],
  defaultSort: { service: 1 },
  populate: ["vendorId"],
});

export const GET = handlers.list;
export const POST = handlers.create;
