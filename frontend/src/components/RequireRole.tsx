import type { Role } from "../../../shared/contracts.ts";
import { useAuth } from "../contexts/AuthContext";

interface RequireRoleProps {
  role: Role;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RequireRole({
  role,
  children,
  fallback = null,
}: RequireRoleProps) {
  const { hasRole } = useAuth();
  return hasRole(role) ? <>{children}</> : <>{fallback}</>;
}

interface RequireAnyRoleProps {
  roles: Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function RequireAnyRole({
  roles,
  children,
  fallback = null,
}: RequireAnyRoleProps) {
  const { hasAnyRole } = useAuth();
  return hasAnyRole(roles) ? <>{children}</> : <>{fallback}</>;
}
