import { crud } from "@/lib/crud";
import { RentalRate } from "@/models";

const handlers = crud({
  model: RentalRate,
  searchFields: [],
  filterFields: ["equipmentId", "vendorId"],
  defaultSort: { effectiveDate: -1 },
  populate: ["equipmentId", "vendorId"],
});

export const GET = handlers.list;
export const POST = handlers.create;
