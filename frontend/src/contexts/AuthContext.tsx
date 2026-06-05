import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { Role, SessionUser } from "../../../shared/contracts.ts";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  error: string | null;
  reloadUser: () => Promise<void>;
  signOut: () => Promise<void>;
  hasRole: (role: Role) => boolean;
  hasAnyRole: (roles: Role[]) => boolean;
  hasAllRoles: (roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reloadUser = useCallback(async () => {
    setError(null);
    const response = await fetch(buildApiUrl("/api/users/me"), {
      credentials: "include",
    });

    if (response.status === 401) {
      setUser(null);
      return;
    }

    if (!response.ok) {
      throw new Error(`Load session failed: HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { data?: SessionUser };
    setUser(payload.data ?? null);
  }, []);

  useEffect(() => {
    let mounted = true;

    reloadUser()
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load user");
        setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [reloadUser]);

  async function signOut() {
    await fetch(buildApiUrl("/api/sign-out"), {
      method: "POST",
      credentials: "include",
    });
    setUser(null);
  }

  function hasRole(role: Role) {
    return user?.roles.includes(role) ?? false;
  }

  function hasAnyRole(roles: Role[]) {
    return roles.some((role) => hasRole(role));
  }

  function hasAllRoles(roles: Role[]) {
    return roles.every((role) => hasRole(role));
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        reloadUser,
        signOut,
        hasRole,
        hasAnyRole,
        hasAllRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
