import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { connectDb } from "@/lib/db";
import { User, type Role, type UserDoc } from "@/models/User";
import { hashPassword, verifyPassword } from "@/lib/authNode";

export { hashPassword, verifyPassword };

const COOKIE_NAME = "bpc_session";
const SESSION_DAYS = 14;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to at least 32 characters. Generate one with: openssl rand -base64 32",
    );
  }
  return new TextEncoder().encode(value);
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

export async function createSession(user: SessionPayload): Promise<void> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = "You need to sign in.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Your role does not allow that.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

/** Roles are ordered: an admin satisfies any requirement, a viewer only "viewer". */
const RANK: Record<Role, number> = { viewer: 1, estimator: 2, admin: 3 };

export async function requireRole(minimum: Role): Promise<SessionPayload> {
  const session = await requireSession();
  if (RANK[session.role] < RANK[minimum]) {
    throw new ForbiddenError(
      `This action needs the ${minimum} role or higher; you are signed in as ${session.role}.`,
    );
  }
  return session;
}

export function canEdit(role: Role | undefined): boolean {
  return role === "admin" || role === "estimator";
}

export function isAdmin(role: Role | undefined): boolean {
  return role === "admin";
}

/** Look the signed-in user up fresh -- roles can change mid-session. */
export async function currentUser(): Promise<UserDoc | null> {
  const session = await getSession();
  if (!session) return null;
  await connectDb();
  return User.findById(session.userId);
}
