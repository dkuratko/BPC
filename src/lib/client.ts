"use client";

/** Thin fetch wrapper: JSON in, JSON out, and errors that carry the server's message. */
export class ApiError extends Error {
  constructor(message: string, public status: number, public issues?: Array<{ path: string; message: string }>) {
    super(message);
    this.name = "ApiError";
  }
}

async function handle<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error ?? `Request failed (${res.status})`, res.status, body?.issues);
  }
  return body as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  return handle<T>(await fetch(path, { cache: "no-store" }));
}

export async function apiSend<T>(path: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  return handle<T>(
    await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
