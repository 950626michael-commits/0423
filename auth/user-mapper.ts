import { roleSchema } from "../shared/contracts.ts";
import type { Role, SessionUser, User } from "../shared/contracts.ts";

function normalizeRoles(rawRoles: unknown): Role[] {
  const parsedRoles = Array.isArray(rawRoles)
    ? rawRoles.filter((role): role is Role => roleSchema.safeParse(role).success)
    : [];

  return parsedRoles.length > 0 ? parsedRoles : ["customer"];
}

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
