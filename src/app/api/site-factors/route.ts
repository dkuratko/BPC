import { crud } from "@/lib/crud";
import { SiteFactor } from "@/models";

const handlers = crud({
  model: SiteFactor,
  searchFields: ["key", "label"],
  filterFields: [],
  defaultSort: { sortOrder: 1 },
  populate: [],
});

export const GET = handlers.list;
export const POST = handlers.create;
