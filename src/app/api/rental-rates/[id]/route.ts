import { crud } from "@/lib/crud";
import { RentalRate } from "@/models";

const handlers = crud({
  model: RentalRate,
  populate: ["equipmentId", "vendorId"],
});

export const GET = handlers.read;
export const PATCH = handlers.update;
export const PUT = handlers.update;
export const DELETE = handlers.remove;
