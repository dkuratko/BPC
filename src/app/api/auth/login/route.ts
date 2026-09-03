import { z } from "zod";
import { connectDb } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { errorResponse, fail, ok } from "@/lib/api";
import { User } from "@/models/User";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await connectDb();
    const { email, password } = LoginSchema.parse(await request.json());

    const user = await User.findOne({ email: email.toLowerCase() }).select("+passwordHash");
    // Same message either way: never reveal which accounts exist.
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      return fail("Email or password is incorrect.", 401);
    }

    await createSession({
      userId: String(user._id),
      email: user.email,
      name: user.name,
      role: user.role,
    });

    user.lastLoginAt = new Date();
    await user.save();

    return ok({ id: String(user._id), name: user.name, email: user.email, role: user.role });
  } catch (err) {
    return errorResponse(err);
  }
}
