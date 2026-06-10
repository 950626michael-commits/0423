import type { Role, SessionUser } from "./contracts.ts";

export function hasRole(user: SessionUser | null | undefined, role: Role) {
  return Boolean(user?.roles.includes(role));
}

export function hasAnyRole(
  user: SessionUser | null | undefined,
  roles: Role[],
) {
  return roles.some((role) => hasRole(user, role));
}

export function hasAllRoles(
  user: SessionUser | null | undefined,
  roles: Role[],
) {
  return roles.every((role) => hasRole(user, role));
}

export function requireRole(user: SessionUser, role: Role) {
  if (!hasRole(user, role)) {
    throwForbidden();
  }
}

export function requireAnyRole(user: SessionUser, roles: Role[]) {
  if (!hasAnyRole(user, roles)) {
    throwForbidden();
  }
}

export function canAccessResource(
  user: SessionUser,
  ownerUserId: string,
  elevatedRoles: Role[] = ["staff", "chef", "owner", "admin"],
) {
  return user.id === ownerUserId || hasAnyRole(user, elevatedRoles);
}

function throwForbidden(): never {
  throw new Response(JSON.stringify({ error: "Forbidden" }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}
