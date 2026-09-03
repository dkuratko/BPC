import { z } from "zod";
import { connectDb } from "@/lib/db";
import { hashPassword, requireRole } from "@/lib/auth";
import { errorResponse, ok } from "@/lib/api";
import { ROLES, User } from "@/models/User";

export async function GET() {
  try {
    await connectDb();
    await requireRole("admin");
    const items = await User.find().sort({ name: 1 });
    return ok({ items, total: items.length });
  } catch (err) {
    return errorResponse(err);
  }
}

const CreateUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(10, "Use at least 10 characters."),
  role: z.enum(ROLES),
});

export async function POST(request: Request) {
  try {
    await connectDb();
    await requireRole("admin");
    const { name, email, password, role } = CreateUserSchema.parse(await request.json());
    const user = await User.create({
      name, email: email.toLowerCase(), role,
      passwordHash: await hashPassword(password),
    });
    return ok(user, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
