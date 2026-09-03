import { z } from "zod";
import { connectDb } from "@/lib/db";
import { hashPassword, requireRole } from "@/lib/auth";
import { errorResponse, fail, ok } from "@/lib/api";
import { ROLES, User } from "@/models/User";

const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  password: z.string().min(10).optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await connectDb();
    const session = await requireRole("admin");
    const { id } = await ctx.params;
    const patch = UpdateUserSchema.parse(await request.json());

    // Locking yourself out of the only admin account is not recoverable in-app.
    if (id === session.userId && (patch.active === false || (patch.role && patch.role !== "admin"))) {
      return fail("You cannot remove your own admin access.", 409);
    }

    const user = await User.findById(id);
    if (!user) return fail("Not found.", 404);
    if (patch.name) user.name = patch.name;
    if (patch.role) user.role = patch.role;
    if (patch.active !== undefined) user.active = patch.active;
    if (patch.password) user.passwordHash = await hashPassword(patch.password);
    await user.save();
    return ok(user);
  } catch (err) {
    return errorResponse(err);
  }
}
