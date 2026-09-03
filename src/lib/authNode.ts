import bcrypt from "bcryptjs";

/**
 * Password hashing without the "server-only" guard, so scripts run outside
 * Next.js (the seeder, one-off admin tools) can create users.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
