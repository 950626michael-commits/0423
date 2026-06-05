import { roleSchema } from "../shared/contracts.ts";
import type { Role, SessionUser, User } from "../shared/contracts.ts";

export function toSessionUser(
  user: Pick<User, "id" | "email" | "name"> & { roles?: unknown },
): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: normalizeRoles(user.roles),
  };
}

function normalizeRoles(rawRoles: unknown): Role[] {
  if (!Array.isArray(rawRoles)) return ["customer"];

  const roles = rawRoles.filter((role): role is Role => {
    return roleSchema.safeParse(role).success;
  });

  return roles.length > 0 ? roles : ["customer"];
}
