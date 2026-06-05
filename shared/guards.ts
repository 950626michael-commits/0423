import type { Role, SessionUser } from "./contracts.ts";

export function hasRole(user: SessionUser | null | undefined, role: Role): boolean {
  return user?.roles.includes(role) ?? false;
}

export function hasAnyRole(
  user: SessionUser | null | undefined,
  roles: readonly Role[],
): boolean {
  return roles.some((role) => hasRole(user, role));
}

export function hasAllRoles(
  user: SessionUser | null | undefined,
  roles: readonly Role[],
): boolean {
  return roles.every((role) => hasRole(user, role));
}

export function requireRole(user: SessionUser, role: Role): void {
  if (!hasRole(user, role)) {
    throwForbidden();
  }
}

export function requireAnyRole(user: SessionUser, roles: readonly Role[]): void {
  if (!hasAnyRole(user, roles)) {
    throwForbidden();
  }
}

export function canAccessResource(
  user: SessionUser,
  resourceOwnerId: string,
  elevatedRoles: readonly Role[] = ["staff", "chef", "owner", "admin"],
): boolean {
  return user.id === resourceOwnerId || hasAnyRole(user, elevatedRoles);
}

function throwForbidden(): never {
  throw new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
