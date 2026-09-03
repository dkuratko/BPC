import { crud } from "@/lib/crud";
import { SourceDocument } from "@/models";

const handlers = crud({
  model: SourceDocument,
  searchFields: ["fileName"],
  filterFields: ["projectId"],
  defaultSort: { createdAt: -1 },
  populate: [],
});

export const GET = handlers.list;
export const POST = handlers.create;
