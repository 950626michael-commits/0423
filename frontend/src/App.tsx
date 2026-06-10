import { useEffect, useMemo, useState } from "react";
import "./App.css";
import type {
  ApiDataResponse,
  MenuItem,
  Order,
  Role,
  RoleRequest,
  SessionUser,
} from "../../shared/contracts.ts";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

async function readApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      typeof payload?.error === "string"
        ? payload.error
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return (await response.json()) as T;
}

function formatDate(value?: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function roleLabel(role: Role) {
  const labels: Record<Role, string> = {
    customer: "顧客",
    staff: "櫃台",
    chef: "廚房",
    owner: "店長",
    admin: "管理員",
  };
  return labels[role];
}

export default function App() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState("");

  const [orderId, setOrderId] = useState<number | null>(null);
  const [cartQtyByItemId, setCartQtyByItemId] = useState<Record<number, number>>(
    {},
  );
  const [cartTotal, setCartTotal] = useState(0);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [operationOrders, setOperationOrders] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [operationsLoading, setOperationsLoading] = useState(false);

  const [activeItemId, setActiveItemId] = useState<number | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const [requestingRole, setRequestingRole] = useState<Role | null>(null);
  const [roleRequestMessage, setRoleRequestMessage] = useState("");
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([]);
  const [roleRequestsLoading, setRoleRequestsLoading] = useState(false);
  const [reviewingRoleRequestId, setReviewingRoleRequestId] = useState<
    number | null
  >(null);

  const hasRole = (role: Role) => user?.roles.includes(role) ?? false;
  const hasAnyRole = (roles: Role[]) => roles.some((role) => hasRole(role));
  const canViewOperations = hasAnyRole(["staff", "chef", "owner", "admin"]);
  const canReviewRoles = hasRole("admin");

  const grouped = useMemo(() => {
    const groupedItems = items.reduce(
      (acc, item) => {
        const category = item.category || "其他";
        acc[category] = [...(acc[category] ?? []), item];
        return acc;
      },
      {} as Record<string, MenuItem[]>,
    );

    return Object.entries(groupedItems).sort(([a], [b]) =>
      a.localeCompare(b, "zh-Hant"),
    );
  }, [items]);

  const cartItemCount = useMemo(
    () => Object.values(cartQtyByItemId).reduce((sum, qty) => sum + qty, 0),
    [cartQtyByItemId],
  );

  const cartDetails = useMemo(() => {
    const itemById = new Map(items.map((item) => [item.id, item]));

    return Object.entries(cartQtyByItemId)
      .map(([itemIdText, qty]) => {
        const item = itemById.get(Number(itemIdText));
        if (!item || qty <= 0) return null;
        return { item, qty, subtotal: item.price * qty };
      })
      .filter((entry): entry is { item: MenuItem; qty: number; subtotal: number } =>
        Boolean(entry),
      );
  }, [cartQtyByItemId, items]);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const [menuResult, sessionResult] = await Promise.allSettled([
          readApi<ApiDataResponse<MenuItem[]>>("/api/menu"),
          readApi<ApiDataResponse<SessionUser>>("/api/users/me"),
        ]);

        if (!mounted) return;

        if (menuResult.status === "fulfilled") {
          setItems(menuResult.value.data);
        } else {
          setPageError("讀取菜單失敗，請確認後端服務是否啟動。");
        }

        if (sessionResult.status === "fulfilled") {
          setUser(sessionResult.value.data);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void boot();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      resetCartState();
      setHistoryOrders([]);
      setOperationOrders([]);
      setRoleRequests([]);
      return;
    }

    void refreshUserOrders();
  }, [user]);

  useEffect(() => {
    if (!user || !canViewOperations) return;
    void loadOperationOrders();
  }, [user]);

  useEffect(() => {
    if (!user || !canReviewRoles) return;
    void loadRoleRequests();
  }, [user]);

  function syncCartFromOrder(order: Order) {
    const nextQtyByItemId = order.items.reduce(
      (acc, orderItem) => {
        acc[orderItem.item.id] = orderItem.qty;
        return acc;
      },
      {} as Record<number, number>,
    );

    setOrderId(order.id);
    setCartQtyByItemId(nextQtyByItemId);
    setCartTotal(order.total);
  }

  function resetCartState() {
    setOrderId(null);
    setCartQtyByItemId({});
    setCartTotal(0);
    setIsCartOpen(false);
  }

  async function loadCurrentOrder() {
    const payload =
      await readApi<ApiDataResponse<Order | null>>("/api/orders/current");

    if (payload.data) {
      syncCartFromOrder(payload.data);
    } else {
      resetCartState();
    }
  }

  async function loadOrderHistory() {
    setHistoryLoading(true);
    try {
      const payload =
        await readApi<ApiDataResponse<Order[]>>("/api/orders/history");
      setHistoryOrders(payload.data);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function refreshUserOrders() {
    await Promise.all([loadCurrentOrder(), loadOrderHistory()]);
  }

  async function loadOperationOrders() {
    setOperationsLoading(true);
    try {
      const payload = await readApi<ApiDataResponse<Order[]>>("/api/orders");
      setOperationOrders(payload.data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "讀取營運訂單失敗");
    } finally {
      setOperationsLoading(false);
    }
  }

  async function loadRoleRequests() {
    setRoleRequestsLoading(true);
    try {
      const payload = await readApi<ApiDataResponse<RoleRequest[]>>(
        "/api/admin/role-requests?status=all",
      );
      setRoleRequests(payload.data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "讀取角色申請失敗");
    } finally {
      setRoleRequestsLoading(false);
    }
  }

  async function reloadUser() {
    const payload = await readApi<ApiDataResponse<SessionUser>>("/api/users/me");
    setUser(payload.data);
  }

  async function ensureOrder() {
    if (orderId !== null) return orderId;

    const payload = await readApi<ApiDataResponse<Order>>("/api/orders", {
      method: "POST",
      body: JSON.stringify({}),
    });

    syncCartFromOrder(payload.data);
    return payload.data.id;
  }

  async function handleGoogleSignIn() {
    setAuthError("");
    setIsGoogleSigningIn(true);

    try {
      const payload = await readApi<{ url?: string }>("/api/auth/sign-in/social", {
        method: "POST",
        body: JSON.stringify({
          provider: "google",
          callbackURL: window.location.origin,
        }),
      });

      if (!payload.url) throw new Error("Google 未回傳登入網址");
      window.location.href = payload.url;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Google 登入失敗");
      setIsGoogleSigningIn(false);
    }
  }

  async function handleLogout() {
    await fetch(buildApiUrl("/api/sign-out"), {
      method: "POST",
      credentials: "include",
    });

    setUser(null);
    setNotice("");
    setAuthError("");
  }

  async function addToCart(item: MenuItem) {
    if (!user) {
      setNotice("請先登入後再加入購物車。");
      return;
    }

    setNotice("");
    setActiveItemId(item.id);

    try {
      const targetOrderId = await ensureOrder();
      const nextQty = (cartQtyByItemId[item.id] ?? 0) + 1;
      const payload = await readApi<ApiDataResponse<Order>>(
        `/api/orders/${targetOrderId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ itemId: item.id, qty: nextQty }),
        },
      );

      syncCartFromOrder(payload.data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "加入購物車失敗");
    } finally {
      setActiveItemId(null);
    }
  }

  async function setCartItemQty(itemId: number, qty: number) {
    if (!orderId) return;

    const payload = await readApi<ApiDataResponse<Order>>(`/api/orders/${orderId}`, {
      method: "PATCH",
      body: JSON.stringify({ itemId, qty }),
    });

    syncCartFromOrder(payload.data);
  }

  async function submitOrder() {
    if (!orderId || cartDetails.length === 0) return;

    setIsSubmittingOrder(true);
    setNotice("");

    try {
      await readApi<ApiDataResponse<Order>>(`/api/orders/${orderId}/submit`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      resetCartState();
      await Promise.all([
        loadOrderHistory(),
        canViewOperations ? loadOperationOrders() : Promise.resolve(),
      ]);
      setNotice("訂單已送出。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "送出訂單失敗");
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  async function requestRole(role: "staff" | "chef") {
    setRequestingRole(role);
    setRoleRequestMessage("");

    try {
      await readApi<ApiDataResponse<RoleRequest>>("/api/users/me/role-request", {
        method: "POST",
        body: JSON.stringify({
          requestedRole: role,
          reason: `我想申請 ${roleLabel(role)} 權限，以協助早餐店營運。`,
        }),
      });

      setRoleRequestMessage("申請已送出，請等待管理員審核。");
    } catch (error) {
      setRoleRequestMessage(
        error instanceof Error ? error.message : "角色申請送出失敗",
      );
    } finally {
      setRequestingRole(null);
    }
  }

  async function reviewRoleRequest(
    requestId: number,
    status: "approved" | "rejected",
  ) {
    setReviewingRoleRequestId(requestId);
    setNotice("");

    try {
      await readApi<ApiDataResponse<RoleRequest>>(
        `/api/admin/role-requests/${requestId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status,
            reviewNote: status === "approved" ? "管理後台核准" : "管理後台拒絕",
          }),
        },
      );

      await loadRoleRequests();
      setNotice(status === "approved" ? "已核准角色申請。" : "已拒絕角色申請。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "審核角色申請失敗");
    } finally {
      setReviewingRoleRequestId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      <header className="sticky top-0 z-20 border-b border-base-300 bg-base-100/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-primary">Breakfast RBAC</p>
            <h1 className="text-2xl font-black">早餐店點餐與權限管理</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {user ? (
              <>
                <span className="badge badge-outline">{user.name}</span>
                {user.roles.map((role) => (
                  <span key={role} className="badge badge-info">
                    {roleLabel(role)}
                  </span>
                ))}
                <button className="btn btn-sm" onClick={() => void handleLogout()}>
                  登出
                </button>
              </>
            ) : (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => void handleGoogleSignIn()}
                disabled={isGoogleSigningIn}
              >
                {isGoogleSigningIn ? "登入中..." : "Google 登入"}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6">
        {pageError ? (
          <div className="alert alert-error">
            <span>{pageError}</span>
          </div>
        ) : null}

        {authError ? (
          <div className="alert alert-warning">
            <span>{authError}</span>
          </div>
        ) : null}

        {notice ? (
          <div className="alert alert-info">
            <span>{notice}</span>
          </div>
        ) : null}

        {user ? (
          <section className="grid gap-4 md:grid-cols-[1fr_1fr]">
            <RoleRequestPanel
              user={user}
              requestingRole={requestingRole}
              message={roleRequestMessage}
              onRequestRole={requestRole}
            />

            <CartSummary
              cartItemCount={cartItemCount}
              cartTotal={cartTotal}
              onOpenCart={() => setIsCartOpen(true)}
            />
          </section>
        ) : (
          <section className="rounded-lg border border-base-300 bg-base-100 p-6 shadow-sm">
            <h2 className="text-xl font-bold">先登入，再開始點餐</h2>
            <p className="mt-2 text-sm opacity-70">
              登入後可以建立自己的訂單，也可以依照角色看到對應的管理功能。
            </p>
          </section>
        )}

        {user && canViewOperations ? (
          <AdminPanel
            canReviewRoles={canReviewRoles}
            operationOrders={operationOrders}
            operationsLoading={operationsLoading}
            roleRequests={roleRequests}
            roleRequestsLoading={roleRequestsLoading}
            reviewingRoleRequestId={reviewingRoleRequestId}
            onReloadOrders={loadOperationOrders}
            onReloadRoleRequests={loadRoleRequests}
            onReviewRoleRequest={reviewRoleRequest}
          />
        ) : null}

        <MenuSection
          grouped={grouped}
          cartQtyByItemId={cartQtyByItemId}
          activeItemId={activeItemId}
          onAddToCart={addToCart}
        />

        {user ? (
          <OrderHistory orders={historyOrders} loading={historyLoading} />
        ) : null}
      </main>

      {user && isCartOpen ? (
        <CartDrawer
          details={cartDetails}
          total={cartTotal}
          isSubmitting={isSubmittingOrder}
          onClose={() => setIsCartOpen(false)}
          onChangeQty={(itemId, qty) => void setCartItemQty(itemId, qty)}
          onSubmit={() => void submitOrder()}
        />
      ) : null}
    </div>
  );
}

function RoleRequestPanel({
  user,
  requestingRole,
  message,
  onRequestRole,
}: {
  user: SessionUser;
  requestingRole: Role | null;
  message: string;
  onRequestRole: (role: "staff" | "chef") => Promise<void>;
}) {
  const alreadyStaff = user.roles.includes("staff");
  const alreadyChef = user.roles.includes("chef");
  const isAdmin = user.roles.includes("admin");

  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-bold">角色申請</h2>
          <p className="text-sm opacity-70">
            一般使用者可以申請櫃台或廚房權限，管理員審核後立即生效。
          </p>
          {message ? <p className="mt-2 text-sm text-primary">{message}</p> : null}
        </div>

        <div className="flex gap-2">
          <button
            className="btn btn-sm btn-outline"
            disabled={isAdmin || alreadyStaff || requestingRole !== null}
            onClick={() => void onRequestRole("staff")}
          >
            {requestingRole === "staff" ? "送出中..." : "申請櫃台"}
          </button>
          <button
            className="btn btn-sm btn-outline"
            disabled={isAdmin || alreadyChef || requestingRole !== null}
            onClick={() => void onRequestRole("chef")}
          >
            {requestingRole === "chef" ? "送出中..." : "申請廚房"}
          </button>
        </div>
      </div>
    </section>
  );
}

function CartSummary({
  cartItemCount,
  cartTotal,
  onOpenCart,
}: {
  cartItemCount: number;
  cartTotal: number;
  onOpenCart: () => void;
}) {
  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">目前購物車</h2>
          <p className="text-sm opacity-70">
            {cartItemCount} 項商品，合計 ${cartTotal}
          </p>
        </div>
        <button className="btn btn-primary" onClick={onOpenCart}>
          查看購物車
        </button>
      </div>
    </section>
  );
}

function AdminPanel({
  canReviewRoles,
  operationOrders,
  operationsLoading,
  roleRequests,
  roleRequestsLoading,
  reviewingRoleRequestId,
  onReloadOrders,
  onReloadRoleRequests,
  onReviewRoleRequest,
}: {
  canReviewRoles: boolean;
  operationOrders: Order[];
  operationsLoading: boolean;
  roleRequests: RoleRequest[];
  roleRequestsLoading: boolean;
  reviewingRoleRequestId: number | null;
  onReloadOrders: () => Promise<void>;
  onReloadRoleRequests: () => Promise<void>;
  onReviewRoleRequest: (
    requestId: number,
    status: "approved" | "rejected",
  ) => Promise<void>;
}) {
  return (
    <section className="grid gap-4 rounded-lg border border-primary/30 bg-base-100 p-5 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Admin Panel</p>
          <h2 className="text-xl font-black">管理後台</h2>
        </div>
        <button
          className="btn btn-sm btn-outline"
          disabled={operationsLoading}
          onClick={() => void onReloadOrders()}
        >
          {operationsLoading ? "刷新中..." : "刷新訂單"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>訂單</th>
              <th>使用者</th>
              <th>狀態</th>
              <th>金額</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            {operationOrders.length === 0 ? (
              <tr>
                <td colSpan={5}>目前沒有可顯示的訂單。</td>
              </tr>
            ) : (
              operationOrders.map((order) => (
                <tr key={order.id}>
                  <td>#{order.id}</td>
                  <td className="max-w-[12rem] truncate">{order.userId}</td>
                  <td>
                    <span className="badge badge-outline">{order.status}</span>
                  </td>
                  <td>${order.total}</td>
                  <td>{formatDate(order.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canReviewRoles ? (
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-bold">角色申請審核</h3>
            <button
              className="btn btn-xs btn-outline"
              disabled={roleRequestsLoading}
              onClick={() => void onReloadRoleRequests()}
            >
              {roleRequestsLoading ? "刷新中..." : "刷新申請"}
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-base-300">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>使用者</th>
                  <th>申請角色</th>
                  <th>狀態</th>
                  <th>理由</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {roleRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6}>目前沒有角色申請。</td>
                  </tr>
                ) : (
                  roleRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{request.id}</td>
                      <td className="max-w-[12rem] truncate">
                        {request.userId}
                      </td>
                      <td>{roleLabel(request.requestedRole)}</td>
                      <td>
                        <span className={statusBadgeClass(request.status)}>
                          {request.status}
                        </span>
                      </td>
                      <td className="max-w-xs truncate">{request.reason}</td>
                      <td>
                        {request.status === "pending" ? (
                          <div className="flex gap-2">
                            <button
                              className="btn btn-xs btn-success"
                              disabled={reviewingRoleRequestId !== null}
                              onClick={() =>
                                void onReviewRoleRequest(request.id, "approved")
                              }
                            >
                              核准
                            </button>
                            <button
                              className="btn btn-xs btn-error btn-outline"
                              disabled={reviewingRoleRequestId !== null}
                              onClick={() =>
                                void onReviewRoleRequest(request.id, "rejected")
                              }
                            >
                              拒絕
                            </button>
                          </div>
                        ) : (
                          <span className="text-sm opacity-60">已處理</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MenuSection({
  grouped,
  cartQtyByItemId,
  activeItemId,
  onAddToCart,
}: {
  grouped: Array<[string, MenuItem[]]>;
  cartQtyByItemId: Record<number, number>;
  activeItemId: number | null;
  onAddToCart: (item: MenuItem) => Promise<void>;
}) {
  return (
    <section className="grid gap-6">
      {grouped.map(([category, categoryItems]) => (
        <div key={category}>
          <h2 className="mb-3 border-b border-primary/40 pb-2 text-2xl font-black text-primary">
            {category}
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {categoryItems.map((item) => (
              <article
                key={item.id}
                className="card bg-base-100 shadow-sm transition-shadow hover:shadow-md"
              >
                <figure className="h-44 bg-base-300">
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </figure>
                <div className="card-body">
                  <h3 className="card-title text-lg">{item.name}</h3>
                  <p className="min-h-11 text-sm opacity-75">{item.description}</p>
                  <div className="card-actions items-center justify-between">
                    <span className="text-xl font-black text-success">
                      ${item.price}
                    </span>
                    <button
                      className="btn btn-sm btn-primary"
                      disabled={activeItemId === item.id}
                      onClick={() => void onAddToCart(item)}
                    >
                      {activeItemId === item.id
                        ? "加入中..."
                        : `加入${cartQtyByItemId[item.id] ? ` (${cartQtyByItemId[item.id]})` : ""}`}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function OrderHistory({
  orders,
  loading,
}: {
  orders: Order[];
  loading: boolean;
}) {
  return (
    <section className="grid gap-3">
      <h2 className="text-xl font-black">我的歷史訂單</h2>
      {loading ? (
        <div className="alert">讀取中...</div>
      ) : orders.length === 0 ? (
        <div className="alert alert-info">目前還沒有已送出的訂單。</div>
      ) : (
        orders.map((order) => (
          <article
            key={order.id}
            className="rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold">訂單 #{order.id}</h3>
              <span className="badge badge-success">${order.total}</span>
            </div>
            <p className="text-sm opacity-70">{formatDate(order.createdAt)}</p>
            <p className="mt-2 text-sm">
              {order.items
                .map((item) => `${item.item.name} x ${item.qty}`)
                .join("、")}
            </p>
          </article>
        ))
      )}
    </section>
  );
}

function CartDrawer({
  details,
  total,
  isSubmitting,
  onClose,
  onChangeQty,
  onSubmit,
}: {
  details: Array<{ item: MenuItem; qty: number; subtotal: number }>;
  total: number;
  isSubmitting: boolean;
  onClose: () => void;
  onChangeQty: (itemId: number, qty: number) => void;
  onSubmit: () => void;
}) {
  return (
    <>
      <button
        className="fixed inset-0 z-30 bg-black/40"
        aria-label="關閉購物車"
        onClick={onClose}
      />
      <aside className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col bg-base-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-base-300 p-4">
          <h2 className="text-xl font-black">購物車</h2>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>
            關閉
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {details.length === 0 ? (
            <div className="alert">購物車目前是空的。</div>
          ) : (
            <ul className="grid gap-3">
              {details.map(({ item, qty, subtotal }) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-base-300 bg-base-200 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">{item.name}</p>
                      <p className="text-sm opacity-70">
                        ${item.price} x {qty}
                      </p>
                    </div>
                    <p className="font-black">${subtotal}</p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      className="btn btn-xs"
                      onClick={() => onChangeQty(item.id, Math.max(qty - 1, 0))}
                    >
                      -
                    </button>
                    <button
                      className="btn btn-xs"
                      onClick={() => onChangeQty(item.id, qty + 1)}
                    >
                      +
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-3 border-t border-base-300 p-4">
          <div className="flex items-center justify-between text-lg font-black">
            <span>合計</span>
            <span>${total}</span>
          </div>
          <button
            className="btn btn-primary"
            disabled={details.length === 0 || isSubmitting}
            onClick={onSubmit}
          >
            {isSubmitting ? "送出中..." : "送出訂單"}
          </button>
        </div>
      </aside>
    </>
  );
}

function statusBadgeClass(status: RoleRequest["status"]) {
  if (status === "approved") return "badge badge-success";
  if (status === "rejected") return "badge badge-error";
  return "badge badge-warning";
}
