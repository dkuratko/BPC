import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { connectDb } from "@/lib/db";
import { ForbiddenError, UnauthorizedError, requireRole, type SessionPayload } from "@/lib/auth";
import { EstimateLockedError } from "@/services/estimateService";
import type { Role } from "@/models/User";

export function ok<T>(data: T, init?: number): NextResponse {
  return NextResponse.json(data as object, { status: init ?? 200 });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/**
 * Wrap a route handler: connect to Mongo, check the caller's role, and turn the
 * errors we throw on purpose into the right status codes instead of a 500.
 */
export function route<T>(
  minimumRole: Role | null,
  handler: (ctx: { session: SessionPayload | null }) => Promise<T>,
): () => Promise<NextResponse> {
  return async () => {
    try {
      await connectDb();
      const session = minimumRole ? await requireRole(minimumRole) : null;
      const data = await handler({ session });
      if (data instanceof NextResponse) return data;
      return ok(data);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) return fail(err.message, 401);
  if (err instanceof ForbiddenError) return fail(err.message, 403);
  if (err instanceof EstimateLockedError) return fail(err.message, 409);
  if (err instanceof ZodError) {
    return fail("That does not look right.", 422, {
      issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof Error) {
    // Mongo duplicate key: report the field rather than the raw driver message.
    const anyErr = err as Error & { code?: number; keyValue?: Record<string, unknown> };
    if (anyErr.code === 11000) {
      const field = Object.keys(anyErr.keyValue ?? {})[0] ?? "value";
      return fail(`That ${field} is already in use.`, 409);
    }
    if (err.name === "ValidationError") return fail(err.message, 422);
    if (err.name === "CastError") return fail("Not found.", 404);
    console.error(err);
    return fail(err.message, 500);
  }
  console.error(err);
  return fail("Something went wrong.", 500);
}

export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  const body = await request.json().catch(() => ({}));
  return schema.parse(body);
}

/** Turn Mongoose docs into plain JSON the client components can hold. */
export function serialize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
