import mongoose from "mongoose";

/**
 * Next.js hot-reloads modules in development, which would otherwise open a new
 * connection pool on every edit. Cache the connection promise on globalThis.
 */
declare global {
  // eslint-disable-next-line no-var
  var __buildplayMongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } | undefined;
}

const cached = globalThis.__buildplayMongoose ?? { conn: null, promise: null };
globalThis.__buildplayMongoose = cached;

export async function connectDb(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env.local (or run `npm run setup`) and start MongoDB with `npm run db:up`.",
    );
  }

  if (!cached.promise) {
    mongoose.set("strictQuery", true);
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}

export async function disconnectDb(): Promise<void> {
  if (cached.conn) {
    await cached.conn.disconnect();
    cached.conn = null;
    cached.promise = null;
  }
}
