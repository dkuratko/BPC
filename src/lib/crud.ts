import { NextResponse } from "next/server";
import type { Model } from "mongoose";
import { ZodSchema } from "zod";
import { connectDb } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { errorResponse, fail, ok } from "@/lib/api";
import type { Role } from "@/models/User";

/**
 * Master-data endpoints are all the same shape, so they share one factory.
 * Only the estimating routes, which have real behaviour, are written by hand.
 */

export interface CrudOptions<T> {
  model: Model<T>;
  /** Fields a `?q=` search should match, case-insensitively. */
  searchFields?: string[];
  /** Query params that may be used as exact-match filters. */
  filterFields?: string[];
  defaultSort?: Record<string, 1 | -1>;
  createSchema?: ZodSchema<unknown>;
  updateSchema?: ZodSchema<unknown>;
  readRole?: Role;
  writeRole?: Role;
  /** Refs to expand on list/read. */
  populate?: string[];
  /** Records with an `active` flag are retired rather than destroyed. */
  softDelete?: boolean;
}

export function crud<T>(options: CrudOptions<T>) {
  const {
    model, searchFields = [], filterFields = [], defaultSort = { createdAt: -1 },
    readRole = "viewer", writeRole = "estimator", populate = [], softDelete = true,
  } = options;

  async function list(request: Request): Promise<NextResponse> {
    try {
      await connectDb();
      await requireRole(readRole);

      const url = new URL(request.url);
      const query: Record<string, unknown> = {};

      const includeInactive = url.searchParams.get("includeInactive") === "true";
      if (softDelete && !includeInactive) query.active = { $ne: false };

      for (const field of filterFields) {
        const value = url.searchParams.get(field);
        if (value !== null && value !== "") query[field] = value;
      }

      const q = url.searchParams.get("q");
      if (q && searchFields.length > 0) {
        const rx = new RegExp(escapeRegExp(q), "i");
        query.$or = searchFields.map((f) => ({ [f]: rx }));
      }

      const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 500);
      const page = Math.max(Number(url.searchParams.get("page") ?? 1), 1);

      let cursor = model.find(query).sort(defaultSort).skip((page - 1) * limit).limit(limit);
      for (const path of populate) cursor = cursor.populate(path);

      const [items, total] = await Promise.all([cursor.exec(), model.countDocuments(query)]);
      return ok({ items, total, page, limit });
    } catch (err) {
      return errorResponse(err);
    }
  }

  async function create(request: Request): Promise<NextResponse> {
    try {
      await connectDb();
      await requireRole(writeRole);
      const body = await request.json();
      const data = options.createSchema ? options.createSchema.parse(body) : body;
      const created = await model.create(data as never);
      return ok(created, 201);
    } catch (err) {
      return errorResponse(err);
    }
  }

  async function read(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
      await connectDb();
      await requireRole(readRole);
      const { id } = await ctx.params;
      let cursor = model.findById(id);
      for (const path of populate) cursor = cursor.populate(path);
      const doc = await cursor.exec();
      if (!doc) return fail("Not found.", 404);
      return ok(doc);
    } catch (err) {
      return errorResponse(err);
    }
  }

  async function update(request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
      await connectDb();
      await requireRole(writeRole);
      const { id } = await ctx.params;
      const body = await request.json();
      const data = options.updateSchema ? options.updateSchema.parse(body) : body;

      // Load-then-save rather than findByIdAndUpdate so pre-validate hooks run
      // (labor rates recompute their burdened rate that way).
      const doc = await model.findById(id);
      if (!doc) return fail("Not found.", 404);
      doc.set(data as never);
      await doc.save();
      return ok(doc);
    } catch (err) {
      return errorResponse(err);
    }
  }

  async function remove(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
    try {
      await connectDb();
      await requireRole("admin");
      const { id } = await ctx.params;
      if (softDelete) {
        const doc = await model.findByIdAndUpdate(id, { active: false }, { new: true });
        if (!doc) return fail("Not found.", 404);
        return ok({ deactivated: true, id });
      }
      const doc = await model.findByIdAndDelete(id);
      if (!doc) return fail("Not found.", 404);
      return ok({ deleted: true, id });
    } catch (err) {
      return errorResponse(err);
    }
  }

  return { list, create, read, update, remove };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
