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
type Language = "zh" | "en";

const translations = {
  zh: {
    languageButton: "English",
    open: "營業中",
    closed: "已打烊",
    businessHours: "營業時間：早上 5:00 到下午 3:00",
    closesAt: "今天下午 3:00 關門",
    opensAt: "明天早上 5:00 開門",
    brand: "廖世宇的早餐店",
    loginRequiredTitle: "請先登入",
    loginRequiredBody: "登入後可以點餐、查看訂單，並依角色使用後台功能。",
    login: "Google 登入",
    loggingIn: "登入中...",
    logout: "登出",
    adminPanel: "管理後台",
    refreshOrders: "刷新訂單",
    refreshing: "刷新中...",
    deleteOrder: "刪除",
    deleting: "刪除中...",
    orderDeleted: "訂單已刪除。",
    orderDeleteFailed: "刪除訂單失敗",
    noOrders: "目前沒有訂單。",
    roleRequestTitle: "職位申請",
    roleRequestHelp: "請先填寫申請目的，管理者審核時會看到這段說明。",
    purposeLabel: "申請目的",
    purposePlaceholder: "例如：想協助點餐、出餐，或說明離職原因",
    applyStaff: "申請櫃台",
    applyChef: "申請廚師",
    resign: "提出離職申請",
    submitting: "送出中...",
    cartTitle: "我的購物車",
    openCart: "查看購物車",
    items: "項",
    comboTitle: "套餐組合",
    comboHelp: "固定一份餐點或蛋餅，搭配一杯飲料，套餐現折 10 元。",
    comboFood: "餐點 / 蛋餅",
    comboDrink: "飲料",
    noComboFood: "沒有可選餐點",
    noComboDrink: "沒有可選飲料",
    addCombo: "加入套餐",
    adding: "加入中...",
    searchLabel: "搜尋餐點",
    managerPick: "店長特選",
    clear: "清除",
  },
  en: {
    languageButton: "中文",
    open: "Open",
    closed: "Closed",
    businessHours: "Hours: 5:00 AM to 3:00 PM",
    closesAt: "Closes today at 3:00 PM",
    opensAt: "Opens tomorrow at 5:00 AM",
    brand: "Liao Shiyu Breakfast Shop",
    loginRequiredTitle: "Please sign in",
    loginRequiredBody:
      "Sign in to order food, view orders, and use role-based admin tools.",
    login: "Sign in with Google",
    loggingIn: "Signing in...",
    logout: "Sign out",
    adminPanel: "Admin Panel",
    refreshOrders: "Refresh orders",
    refreshing: "Refreshing...",
    deleteOrder: "Delete",
    deleting: "Deleting...",
    orderDeleted: "Order deleted.",
    orderDeleteFailed: "Failed to delete order",
    noOrders: "No orders yet.",
    roleRequestTitle: "Position Request",
    roleRequestHelp:
      "Write your purpose first. Managers will see this note while reviewing.",
    purposeLabel: "Purpose",
    purposePlaceholder:
      "Example: I want to help with ordering, cooking, or explain resignation.",
    applyStaff: "Apply for Staff",
    applyChef: "Apply for Chef",
    resign: "Submit resignation",
    submitting: "Submitting...",
    cartTitle: "My Cart",
    openCart: "Open cart",
    items: "items",
    comboTitle: "Combo Set",
    comboHelp: "One meal or egg pancake with one drink. Combo saves $10.",
    comboFood: "Meal / Egg pancake",
    comboDrink: "Drink",
    noComboFood: "No meal options",
    noComboDrink: "No drink options",
    addCombo: "Add combo",
    adding: "Adding...",
    searchLabel: "Search menu",
    managerPick: "Manager Pick",
    clear: "Clear",
  },
} satisfies Record<Language, Record<string, string>>;

function getBusinessStatus(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const minutes = hour * 60 + minute;

  return {
    isOpen: minutes >= 5 * 60 && minutes < 15 * 60,
  };
}

function buildApiUrl(path: string) {
  return `${apiBaseUrl}${path}`;
}

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function isHttpStatus(error: unknown, status: number): boolean {
  return error instanceof ApiRequestError && error.status === status;
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
    throw new ApiRequestError(message, response.status);
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

function staffRolesFor(position: Role): Role[] {
  return position === "customer" ? ["customer"] : ["customer", position];
}

function roleRequestLabel(role: Role) {
  return role === "customer" ? "\u96e2\u8077\u7533\u8acb" : roleLabel(role);
}

function menuItemSearchText(item: MenuItem) {
  return [item.name, item.category, item.description, item.image_url]
    .join(" ")
    .toLowerCase();
}

function isDrinkItem(item: MenuItem) {
  const text = menuItemSearchText(item);
  return [
    "drink",
    "tea",
    "coffee",
    "latte",
    "milk",
    "soy",
    "juice",
    "beverage",
    "\u98f2",
    "\u8336",
    "\u5496\u5561",
    "\u8c46\u6f3f",
    "\u5976",
    "\u679c\u6c41",
  ].some((keyword) => text.includes(keyword));
}

function isMainComboItem(item: MenuItem) {
  const text = menuItemSearchText(item);
  if (isDrinkItem(item)) return false;

  return [
    "egg",
    "toast",
    "sandwich",
    "burger",
    "pancake",
    "roll",
    "\u86cb\u9905",
    "\u5410\u53f8",
    "\u6f22\u5821",
    "\u4e09\u660e\u6cbb",
    "\u9910",
  ].some((keyword) => text.includes(keyword));
}

export default function App() {
  const [language, setLanguage] = useState<Language>("zh");
  const [businessStatus, setBusinessStatus] = useState(() =>
    getBusinessStatus(),
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [authError, setAuthError] = useState("");
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  const [items, setItems] = useState<MenuItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
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
  const [comboFoodId, setComboFoodId] = useState<number | null>(null);
  const [comboDrinkId, setComboDrinkId] = useState<number | null>(null);
  const [isAddingCombo, setIsAddingCombo] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const [requestingRole, setRequestingRole] = useState<Role | null>(null);
  const [roleRequestMessage, setRoleRequestMessage] = useState("");
  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([]);
  const [roleRequestsLoading, setRoleRequestsLoading] = useState(false);
  const [reviewingRoleRequestId, setReviewingRoleRequestId] = useState<
    number | null
  >(null);
  const [clearingRoleRequests, setClearingRoleRequests] = useState(false);

  const [adminUsers, setAdminUsers] = useState<SessionUser[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deletingOrderId, setDeletingOrderId] = useState<number | null>(null);

  const t = translations[language];

  const hasRole = (role: Role) => user?.roles.includes(role) ?? false;
  const hasAnyRole = (roles: Role[]) => roles.some((role) => hasRole(role));
  const canViewOperations = hasAnyRole(["staff", "chef", "owner", "admin"]);
  const canReviewRoles = hasRole("admin");
  const canDeleteOrders = hasAnyRole(["owner", "admin"]);
  const canManageMenu = hasAnyRole(["owner", "admin"]);

  const filteredItems = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return items;

    return items.filter((item) => {
      return [item.name, item.category, item.description]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [items, searchQuery]);

  const grouped = useMemo(() => {
    const groupedItems = filteredItems.reduce(
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
  }, [filteredItems]);

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

  const comboFoodOptions = useMemo(() => {
    const preferred = items.filter(isMainComboItem);
    return preferred.length > 0
      ? preferred
      : items.filter((item) => !isDrinkItem(item));
  }, [items]);

  const comboDrinkOptions = useMemo(() => items.filter(isDrinkItem), [items]);

  useEffect(() => {
    if (!comboFoodId && comboFoodOptions[0]) {
      setComboFoodId(comboFoodOptions[0].id);
    }
  }, [comboFoodId, comboFoodOptions]);

  useEffect(() => {
    if (!comboDrinkId && comboDrinkOptions[0]) {
      setComboDrinkId(comboDrinkOptions[0].id);
    }
  }, [comboDrinkId, comboDrinkOptions]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setBusinessStatus(getBusinessStatus());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

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
      setAdminUsers([]);
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
    void Promise.all([loadRoleRequests(), loadAdminUsers()]);
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

  async function refreshMenu() {
    const payload = await readApi<ApiDataResponse<MenuItem[]>>("/api/menu");
    setItems(payload.data);
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

  async function deleteOperationOrder(orderId: number) {
    setDeletingOrderId(orderId);
    setNotice("");

    try {
      await readApi<ApiDataResponse<Order>>(`/api/orders/${orderId}`, {
        method: "DELETE",
      });

      await Promise.all([loadOperationOrders(), refreshUserOrders()]);
      setNotice(t.orderDeleted);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t.orderDeleteFailed);
    } finally {
      setDeletingOrderId(null);
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

  async function loadAdminUsers() {
    setAdminUsersLoading(true);
    try {
      const payload =
        await readApi<ApiDataResponse<SessionUser[]>>("/api/admin/users");
      setAdminUsers(payload.data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "讀取員工清單失敗");
    } finally {
      setAdminUsersLoading(false);
    }
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

  async function patchOrderItem(targetOrderId: number, itemId: number, qty: number) {
    return readApi<ApiDataResponse<Order>>(`/api/orders/${targetOrderId}`, {
      method: "PATCH",
      body: JSON.stringify({ itemId, qty }),
    });
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
      const payload = await patchOrderItem(targetOrderId, item.id, nextQty);

      syncCartFromOrder(payload.data);
    } catch (error) {
      if (isHttpStatus(error, 409)) {
        setNotice("\u8cfc\u7269\u8eca\u88e1\u6709\u820a\u7248\u83dc\u55ae\u54c1\u9805\uff0c\u5df2\u91cd\u65b0\u6574\u7406\u83dc\u55ae\uff0c\u8acb\u91cd\u65b0\u52a0\u5165\u3002");
        resetCartState();
        await refreshMenu().catch((refreshError) => {
          console.error(refreshError);
        });
        return;
      }

      setNotice(error instanceof Error ? error.message : "加入購物車失敗");
    } finally {
      setActiveItemId(null);
    }
  }

  async function addComboToCart() {
    if (!user) {
      setNotice("\u8acb\u5148\u767b\u5165\u5f8c\u518d\u52a0\u5165\u5957\u9910\u3002");
      return;
    }

    if (!comboFoodId || !comboDrinkId) {
      setNotice(
        "\u5957\u9910\u9700\u8981\u9078\u4e00\u4efd\u9910\u9ede\u548c\u4e00\u676f\u98f2\u6599\u3002",
      );
      return;
    }

    setNotice("");
    setIsAddingCombo(true);

    try {
      const targetOrderId = await ensureOrder();
      const nextQuantities = new Map<number, number>();

      for (const itemId of [comboFoodId, comboDrinkId]) {
        nextQuantities.set(
          itemId,
          (nextQuantities.get(itemId) ?? cartQtyByItemId[itemId] ?? 0) + 1,
        );
      }

      let latestOrder: Order | null = null;
      for (const [itemId, qty] of nextQuantities) {
        const payload = await patchOrderItem(targetOrderId, itemId, qty);
        latestOrder = payload.data;
      }

      if (latestOrder) syncCartFromOrder(latestOrder);
      setNotice("\u5957\u9910\u5df2\u52a0\u5165\u8cfc\u7269\u8eca\u3002");
    } catch (error) {
      if (isHttpStatus(error, 409)) {
        setNotice("\u8cfc\u7269\u8eca\u88e1\u6709\u820a\u7248\u83dc\u55ae\u54c1\u9805\uff0c\u5df2\u91cd\u65b0\u6574\u7406\u83dc\u55ae\uff0c\u8acb\u91cd\u65b0\u52a0\u5165\u3002");
        resetCartState();
        await refreshMenu().catch((refreshError) => {
          console.error(refreshError);
        });
        return;
      }

      setNotice(
        error instanceof Error
          ? error.message
          : "\u52a0\u5165\u5957\u9910\u5931\u6557",
      );
    } finally {
      setIsAddingCombo(false);
    }
  }

  async function setCartItemQty(itemId: number, qty: number) {
    if (!orderId) return;

    const payload = await patchOrderItem(orderId, itemId, qty);

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
      if (isHttpStatus(error, 409)) {
        setNotice("\u8cfc\u7269\u8eca\u5167\u6709\u50f9\u683c\u6216\u7248\u672c\u5df2\u8b8a\u66f4\u7684\u54c1\u9805\uff0c\u8acb\u6e05\u7a7a\u5f8c\u91cd\u65b0\u52a0\u5165\u518d\u9001\u51fa\u3002");
        await Promise.all([
          refreshMenu().catch((refreshError) => {
            console.error(refreshError);
          }),
          loadCurrentOrder().catch((refreshError) => {
            console.error(refreshError);
          }),
        ]);
        return;
      }

      setNotice(error instanceof Error ? error.message : "送出訂單失敗");
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  async function requestRole(role: "staff" | "chef" | "customer", reason: string) {
    setRequestingRole(role);
    setRoleRequestMessage("");

    try {
      await readApi<ApiDataResponse<RoleRequest>>("/api/users/me/role-request", {
        method: "POST",
        body: JSON.stringify({
          requestedRole: role,
          reason,
        }),
      });

      setRoleRequestMessage("\u7533\u8acb\u5df2\u9001\u51fa\uff0c\u8acb\u7b49\u5f85\u7ba1\u7406\u54e1\u5be9\u6838\u3002");
    } catch (error) {
      setRoleRequestMessage(
        error instanceof Error
          ? error.message
          : "\u7533\u8acb\u9001\u51fa\u5931\u6557",
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

      await Promise.all([loadRoleRequests(), loadAdminUsers()]);
      setNotice(status === "approved" ? "已核准角色申請。" : "已拒絕角色申請。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "審核角色申請失敗");
    } finally {
      setReviewingRoleRequestId(null);
    }
  }

  async function clearRoleRequests() {
    setClearingRoleRequests(true);
    setNotice("");

    try {
      const payload = await readApi<ApiDataResponse<{ deleted: number }>>(
        "/api/admin/role-requests",
        { method: "DELETE" },
      );

      setRoleRequests([]);
      setNotice(`\u5df2\u6e05\u7a7a ${payload.data.deleted} \u7b46\u7533\u8acb\u3002`);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "\u6e05\u7a7a\u7533\u8acb\u5931\u6557",
      );
    } finally {
      setClearingRoleRequests(false);
    }
  }

  async function updateUserRoles(targetUserId: string, roles: Role[]) {
    setUpdatingUserId(targetUserId);
    setNotice("");

    try {
      await readApi<ApiDataResponse<SessionUser>>(
        `/api/admin/users/${targetUserId}/roles`,
        {
          method: "PATCH",
          body: JSON.stringify({ roles }),
        },
      );

      await loadAdminUsers();
      setNotice("員工職位已更新。");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "更新員工職位失敗");
    } finally {
      setUpdatingUserId(null);
    }
  }

  async function createMenuItem(input: {
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
  }) {
    await readApi<ApiDataResponse<MenuItem>>("/api/menu", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await refreshMenu();
    setNotice("\u83dc\u55ae\u54c1\u9805\u5df2\u65b0\u589e\u3002");
  }

  async function updateMenuItemPrice(
    menuItemId: number,
    price: number,
    changeReason: string,
  ) {
    await readApi<ApiDataResponse<MenuItem>>(`/api/menu/${menuItemId}`, {
      method: "PATCH",
      body: JSON.stringify({ price, changeReason }),
    });
    await refreshMenu();
    setNotice("\u50f9\u683c\u5df2\u66f4\u65b0\uff0c\u820a\u50f9\u683c\u5df2\u4fdd\u7559\u5728\u7248\u672c\u7d00\u9304\u3002");
  }

  async function loadMenuItemHistory(menuItemId: number) {
    const payload = await readApi<ApiDataResponse<MenuItem[]>>(
      `/api/menu/${menuItemId}/history`,
    );
    return payload.data;
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
            <h1 className="text-2xl font-black">{t.brand}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-sm btn-outline"
              onClick={() => setLanguage((current) => (current === "zh" ? "en" : "zh"))}
            >
              {t.languageButton}
            </button>
            {user ? (
              <>
                <span className="badge badge-outline">{user.name}</span>
                {user.roles.map((role) => (
                  <span key={role} className="badge badge-info">
                    {roleLabel(role)}
                  </span>
                ))}
                <button className="btn btn-sm" onClick={() => void handleLogout()}>
                  {t.logout}
                </button>
              </>
            ) : (
              <button
                className="btn btn-sm btn-primary"
                onClick={() => void handleGoogleSignIn()}
                disabled={isGoogleSigningIn}
              >
                {isGoogleSigningIn ? t.loggingIn : t.login}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6">
        <section
          className={`alert ${
            businessStatus.isOpen ? "alert-success" : "alert-warning"
          }`}
        >
          <div>
            <h2 className="font-bold">
              {businessStatus.isOpen ? t.open : t.closed}
            </h2>
            <p className="text-sm">
              {t.businessHours} ·{" "}
              {businessStatus.isOpen ? t.closesAt : t.opensAt}
            </p>
          </div>
        </section>

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
              labels={t}
              user={user}
              requestingRole={requestingRole}
              message={roleRequestMessage}
              onRequestRole={requestRole}
            />

            <CartSummary
              labels={t}
              cartItemCount={cartItemCount}
              cartTotal={cartTotal}
              onOpenCart={() => setIsCartOpen(true)}
            />
          </section>
        ) : (
          <section className="rounded-lg border border-base-300 bg-base-100 p-6 shadow-sm">
            <h2 className="text-xl font-bold">{t.loginRequiredTitle}</h2>
            <p className="mt-2 text-sm opacity-70">{t.loginRequiredBody}</p>
          </section>
        )}

        {user && canViewOperations ? (
          <AdminPanel
            labels={t}
            currentUserId={user.id}
            canDeleteOrders={canDeleteOrders}
            canReviewRoles={canReviewRoles}
            canManageMenu={canManageMenu}
            menuItems={items}
            operationOrders={operationOrders}
            operationsLoading={operationsLoading}
            deletingOrderId={deletingOrderId}
            roleRequests={roleRequests}
            roleRequestsLoading={roleRequestsLoading}
            reviewingRoleRequestId={reviewingRoleRequestId}
            clearingRoleRequests={clearingRoleRequests}
            adminUsers={adminUsers}
            adminUsersLoading={adminUsersLoading}
            updatingUserId={updatingUserId}
            onReloadOrders={loadOperationOrders}
            onDeleteOrder={deleteOperationOrder}
            onReloadRoleRequests={loadRoleRequests}
            onClearRoleRequests={clearRoleRequests}
            onReloadUsers={loadAdminUsers}
            onReviewRoleRequest={reviewRoleRequest}
            onUpdateUserRoles={updateUserRoles}
            onCreateMenuItem={createMenuItem}
            onUpdateMenuItemPrice={updateMenuItemPrice}
            onLoadMenuItemHistory={loadMenuItemHistory}
          />
        ) : null}

        <ComboBuilder
          labels={t}
          foodOptions={comboFoodOptions}
          drinkOptions={comboDrinkOptions}
          foodId={comboFoodId}
          drinkId={comboDrinkId}
          isAdding={isAddingCombo}
          onChangeFood={setComboFoodId}
          onChangeDrink={setComboDrinkId}
          onAddCombo={() => void addComboToCart()}
        />

        <MenuSearch
          labels={t}
          query={searchQuery}
          totalCount={items.length}
          resultCount={filteredItems.length}
          onChange={setSearchQuery}
        />

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
  onRequestRole: (role: "staff" | "chef" | "customer", reason: string) => Promise<void>;
}) {
  const [purpose, setPurpose] = useState("");
  const alreadyStaff = user.roles.includes("staff");
  const alreadyChef = user.roles.includes("chef");
  const isAdmin = user.roles.includes("admin");
  const canResign = !isAdmin && user.roles.some((role) => role !== "customer");
  const trimmedPurpose = purpose.trim();
  const purposeIsValid = trimmedPurpose.length >= 10;

  async function submitRequest(role: "staff" | "chef" | "customer") {
    await onRequestRole(role, trimmedPurpose);
    setPurpose("");
  }

  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="grid gap-4">
        <div>
          <h2 className="text-lg font-bold">{"\u8077\u4f4d\u7533\u8acb"}</h2>
          <p className="text-sm opacity-70">
            {"\u8acb\u5148\u586b\u5beb\u7533\u8acb\u76ee\u7684\uff0c\u7ba1\u7406\u8005\u5be9\u6838\u6642\u6703\u770b\u5230\u9019\u6bb5\u8aaa\u660e\u3002"}
          </p>
          {message ? <p className="mt-2 text-sm text-primary">{message}</p> : null}
        </div>

        <label className="form-control">
          <div className="label">
            <span className="label-text font-semibold">{"\u7533\u8acb\u76ee\u7684"}</span>
            <span className="label-text-alt">{trimmedPurpose.length} / 10</span>
          </div>
          <textarea
            className="textarea textarea-bordered min-h-24"
            value={purpose}
            placeholder={"\u4f8b\u5982\uff1a\u60f3\u5354\u52a9\u9ede\u9910\u3001\u51fa\u9910\uff0c\u6216\u8aaa\u660e\u96e2\u8077\u539f\u56e0"}
            onChange={(event) => setPurpose(event.target.value)}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            className="btn btn-sm btn-outline"
            disabled={isAdmin || alreadyStaff || requestingRole !== null || !purposeIsValid}
            onClick={() => void submitRequest("staff")}
          >
            {requestingRole === "staff"
              ? "\u9001\u51fa\u4e2d..."
              : "\u7533\u8acb\u6ac3\u53f0"}
          </button>
          <button
            className="btn btn-sm btn-outline"
            disabled={isAdmin || alreadyChef || requestingRole !== null || !purposeIsValid}
            onClick={() => void submitRequest("chef")}
          >
            {requestingRole === "chef"
              ? "\u9001\u51fa\u4e2d..."
              : "\u7533\u8acb\u5eda\u5e2b"}
          </button>
          <button
            className="btn btn-sm btn-error btn-outline"
            disabled={!canResign || requestingRole !== null || !purposeIsValid}
            onClick={() => void submitRequest("customer")}
          >
            {requestingRole === "customer"
              ? "\u9001\u51fa\u4e2d..."
              : "\u63d0\u51fa\u96e2\u8077\u7533\u8acb"}
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

function ComboBuilder({
  foodOptions,
  drinkOptions,
  foodId,
  drinkId,
  isAdding,
  onChangeFood,
  onChangeDrink,
  onAddCombo,
}: {
  foodOptions: MenuItem[];
  drinkOptions: MenuItem[];
  foodId: number | null;
  drinkId: number | null;
  isAdding: boolean;
  onChangeFood: (itemId: number) => void;
  onChangeDrink: (itemId: number) => void;
  onAddCombo: () => void;
}) {
  const selectedFood = foodOptions.find((item) => item.id === foodId);
  const selectedDrink = drinkOptions.find((item) => item.id === drinkId);
  const comboOriginalTotal = (selectedFood?.price ?? 0) + (selectedDrink?.price ?? 0);
  const comboTotal = Math.max(0, comboOriginalTotal - 10);
  const canAdd = Boolean(selectedFood && selectedDrink);

  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
        <div>
          <h2 className="text-lg font-bold">{"\u5957\u9910\u7d44\u5408"}</h2>
          <p className="text-sm opacity-70">
            {"\u56fa\u5b9a\u4e00\u4efd\u9910\u9ede\u6216\u86cb\u9905\uff0c\u642d\u914d\u4e00\u676f\u98f2\u6599\uff0c\u5957\u9910\u73fe\u6298 10 \u5143\u3002"}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="form-control">
            <div className="label">
              <span className="label-text">
                {"\u9910\u9ede / \u86cb\u9905"}
              </span>
            </div>
            <select
              className="select select-bordered"
              value={foodId ?? ""}
              onChange={(event) => onChangeFood(Number(event.target.value))}
            >
              {foodOptions.length === 0 ? (
                <option value="">{"\u6c92\u6709\u53ef\u9078\u9910\u9ede"}</option>
              ) : (
                foodOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ${item.price}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="form-control">
            <div className="label">
              <span className="label-text">{"\u98f2\u6599"}</span>
            </div>
            <select
              className="select select-bordered"
              value={drinkId ?? ""}
              onChange={(event) => onChangeDrink(Number(event.target.value))}
            >
              {drinkOptions.length === 0 ? (
                <option value="">{"\u6c92\u6709\u53ef\u9078\u98f2\u6599"}</option>
              ) : (
                drinkOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} ${item.price}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        <button
          className="btn btn-primary"
          disabled={!canAdd || isAdding}
          onClick={onAddCombo}
        >
          {isAdding
            ? "\u52a0\u5165\u4e2d..."
            : `\u52a0\u5165\u5957\u9910 $${comboTotal}`}
        </button>
      </div>
    </section>
  );
}

function MenuSearch({
  labels,
  query,
  totalCount,
  resultCount,
  onChange,
}: {
  labels: (typeof translations)[Language];
  query: string;
  totalCount: number;
  resultCount: number;
  onChange: (value: string) => void;
}) {
  return (
    <section className="rounded-lg border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <label className="form-control w-full md:max-w-xl">
          <div className="label">
            <span className="label-text font-bold">{labels.searchLabel}</span>
          </div>
          <input
            className="input input-bordered"
            value={query}
            placeholder={labels.searchLabel}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <a
            className="btn btn-sm btn-secondary"
            href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
            target="_blank"
            rel="noreferrer"
          >
            {labels.managerPick}
          </a>
          <span className="badge badge-outline">
            {resultCount} / {totalCount} {labels.items}
          </span>
          {query ? (
            <button className="btn btn-sm btn-ghost" onClick={() => onChange("")}>
              {labels.clear}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function AdminPanel({
  labels,
  currentUserId,
  canDeleteOrders,
  canReviewRoles,
  canManageMenu,
  menuItems,
  operationOrders,
  operationsLoading,
  deletingOrderId,
  roleRequests,
  roleRequestsLoading,
  reviewingRoleRequestId,
  clearingRoleRequests,
  adminUsers,
  adminUsersLoading,
  updatingUserId,
  onReloadOrders,
  onDeleteOrder,
  onReloadRoleRequests,
  onClearRoleRequests,
  onReloadUsers,
  onReviewRoleRequest,
  onUpdateUserRoles,
  onCreateMenuItem,
  onUpdateMenuItemPrice,
  onLoadMenuItemHistory,
}: {
  labels: (typeof translations)[Language];
  currentUserId: string;
  canDeleteOrders: boolean;
  canReviewRoles: boolean;
  canManageMenu: boolean;
  menuItems: MenuItem[];
  operationOrders: Order[];
  operationsLoading: boolean;
  deletingOrderId: number | null;
  roleRequests: RoleRequest[];
  roleRequestsLoading: boolean;
  reviewingRoleRequestId: number | null;
  clearingRoleRequests: boolean;
  adminUsers: SessionUser[];
  adminUsersLoading: boolean;
  updatingUserId: string | null;
  onReloadOrders: () => Promise<void>;
  onDeleteOrder: (orderId: number) => Promise<void>;
  onReloadRoleRequests: () => Promise<void>;
  onClearRoleRequests: () => Promise<void>;
  onReloadUsers: () => Promise<void>;
  onReviewRoleRequest: (
    requestId: number,
    status: "approved" | "rejected",
  ) => Promise<void>;
  onUpdateUserRoles: (userId: string, roles: Role[]) => Promise<void>;
  onCreateMenuItem: (input: {
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
  }) => Promise<void>;
  onUpdateMenuItemPrice: (
    menuItemId: number,
    price: number,
    changeReason: string,
  ) => Promise<void>;
  onLoadMenuItemHistory: (menuItemId: number) => Promise<MenuItem[]>;
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

      <MenuManagement
        items={menuItems}
        canManageMenu={canManageMenu}
        onCreateMenuItem={onCreateMenuItem}
        onUpdateMenuItemPrice={onUpdateMenuItemPrice}
        onLoadMenuItemHistory={onLoadMenuItemHistory}
      />

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
        <>
          <EmployeeManager
            currentUserId={currentUserId}
            users={adminUsers}
            loading={adminUsersLoading}
            updatingUserId={updatingUserId}
            onReload={onReloadUsers}
            onUpdateUserRoles={onUpdateUserRoles}
          />

          <RoleRequestReview
            roleRequests={roleRequests}
            loading={roleRequestsLoading}
            reviewingRoleRequestId={reviewingRoleRequestId}
            clearingRoleRequests={clearingRoleRequests}
            onReload={onReloadRoleRequests}
            onClear={onClearRoleRequests}
            onReviewRoleRequest={onReviewRoleRequest}
          />
        </>
      ) : null}
    </section>
  );
}

function MenuManagement({
  items,
  canManageMenu,
  onCreateMenuItem,
  onUpdateMenuItemPrice,
  onLoadMenuItemHistory,
}: {
  items: MenuItem[];
  canManageMenu: boolean;
  onCreateMenuItem: (input: {
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
  }) => Promise<void>;
  onUpdateMenuItemPrice: (
    menuItemId: number,
    price: number,
    changeReason: string,
  ) => Promise<void>;
  onLoadMenuItemHistory: (menuItemId: number) => Promise<MenuItem[]>;
}) {
  const [newItem, setNewItem] = useState({
    name: "",
    price: "",
    category: "",
    description: "",
    image_url: "/imgs/menu/hot-latte.webp",
  });
  const [priceDrafts, setPriceDrafts] = useState<Record<number, string>>({});
  const [reasonDrafts, setReasonDrafts] = useState<Record<number, string>>({});
  const [historyByItemId, setHistoryByItemId] = useState<
    Record<number, MenuItem[]>
  >({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function submitCreate() {
    const price = Number(newItem.price);
    if (
      !newItem.name.trim() ||
      !newItem.category.trim() ||
      !newItem.description.trim() ||
      !newItem.image_url.trim() ||
      !Number.isFinite(price) ||
      price < 0
    ) {
      setMessage("\u8acb\u586b\u5b8c\u83dc\u55ae\u540d\u7a31\u3001\u50f9\u683c\u3001\u5206\u985e\u3001\u63cf\u8ff0\u8207\u5716\u7247\u8def\u5f91\u3002");
      return;
    }

    setBusyKey("create");
    setMessage("");
    try {
      await onCreateMenuItem({
        name: newItem.name.trim(),
        price,
        category: newItem.category.trim(),
        description: newItem.description.trim(),
        image_url: newItem.image_url.trim(),
      });
      setNewItem({
        name: "",
        price: "",
        category: "",
        description: "",
        image_url: "/imgs/menu/hot-latte.webp",
      });
      setMessage("\u5df2\u65b0\u589e\u83dc\u55ae\u54c1\u9805\u3002");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\u65b0\u589e\u83dc\u55ae\u5931\u6557");
    } finally {
      setBusyKey(null);
    }
  }

  async function submitPriceUpdate(item: MenuItem) {
    const price = Number(priceDrafts[item.id] ?? item.price);
    const changeReason = (reasonDrafts[item.id] ?? "").trim();

    if (!Number.isFinite(price) || price < 0) {
      setMessage("\u8acb\u8f38\u5165\u6b63\u78ba\u50f9\u683c\u3002");
      return;
    }

    if (changeReason.length < 3) {
      setMessage("\u8acb\u586b\u5beb\u8abf\u6574\u50f9\u683c\u7684\u539f\u56e0\u3002");
      return;
    }

    setBusyKey(`price:${item.id}`);
    setMessage("");
    try {
      await onUpdateMenuItemPrice(item.id, price, changeReason);
      setPriceDrafts((current) => ({ ...current, [item.id]: "" }));
      setReasonDrafts((current) => ({ ...current, [item.id]: "" }));
      setHistoryByItemId((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setMessage("\u50f9\u683c\u5df2\u66f4\u65b0\uff0c\u4e26\u5df2\u8a18\u9304\u820a\u50f9\u683c\u8207\u8b8a\u66f4\u539f\u56e0\u3002");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\u66f4\u65b0\u50f9\u683c\u5931\u6557");
    } finally {
      setBusyKey(null);
    }
  }

  async function toggleHistory(itemId: number) {
    if (historyByItemId[itemId]) {
      setHistoryByItemId((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
      return;
    }

    setBusyKey(`history:${itemId}`);
    setMessage("");
    try {
      const history = await onLoadMenuItemHistory(itemId);
      setHistoryByItemId((current) => ({ ...current, [itemId]: history }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "\u8f09\u5165\u7248\u672c\u7d00\u9304\u5931\u6557");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border border-base-300 p-4">
      <div>
        <h3 className="font-bold">{"\u83dc\u55ae\u7ba1\u7406"}</h3>
        <p className="text-sm opacity-70">
          {"\u65b0\u589e\u83dc\u55ae\u8207\u8abf\u6574\u50f9\u683c\u6703\u4fdd\u7559\u7248\u672c\u7d00\u9304\uff0c\u53ef\u8ffd\u8e64\u539f\u50f9\u8207\u8b8a\u66f4\u539f\u56e0\u3002"}
        </p>
        {message ? <p className="mt-2 text-sm text-primary">{message}</p> : null}
      </div>

      {canManageMenu ? (
        <div className="grid gap-3 rounded-lg bg-base-200 p-3 md:grid-cols-5">
          <input
            className="input input-bordered input-sm"
            value={newItem.name}
            placeholder={"\u54c1\u9805\u540d\u7a31"}
            onChange={(event) =>
              setNewItem((current) => ({ ...current, name: event.target.value }))
            }
          />
          <input
            className="input input-bordered input-sm"
            value={newItem.price}
            type="number"
            min="0"
            placeholder={"\u50f9\u683c"}
            onChange={(event) =>
              setNewItem((current) => ({ ...current, price: event.target.value }))
            }
          />
          <input
            className="input input-bordered input-sm"
            value={newItem.category}
            placeholder={"\u5206\u985e"}
            onChange={(event) =>
              setNewItem((current) => ({
                ...current,
                category: event.target.value,
              }))
            }
          />
          <input
            className="input input-bordered input-sm"
            value={newItem.image_url}
            placeholder={"\u5716\u7247\u8def\u5f91"}
            onChange={(event) =>
              setNewItem((current) => ({
                ...current,
                image_url: event.target.value,
              }))
            }
          />
          <button
            className="btn btn-sm btn-primary"
            disabled={busyKey === "create"}
            onClick={() => void submitCreate()}
          >
            {busyKey === "create"
              ? "\u65b0\u589e\u4e2d..."
              : "\u65b0\u589e\u83dc\u55ae"}
          </button>
          <textarea
            className="textarea textarea-bordered textarea-sm md:col-span-5"
            value={newItem.description}
            placeholder={"\u54c1\u9805\u63cf\u8ff0"}
            onChange={(event) =>
              setNewItem((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>{"\u54c1\u9805"}</th>
              <th>{"\u76ee\u524d\u50f9\u683c"}</th>
              <th>{"\u7248\u672c"}</th>
              <th>{"\u65b0\u50f9\u683c"}</th>
              <th>{"\u8b8a\u66f4\u539f\u56e0"}</th>
              <th>{"\u64cd\u4f5c"}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const history = historyByItemId[item.id];

              return (
                <tr key={item.id}>
                  <td className="min-w-44">
                    <div className="font-semibold">{item.name}</div>
                    <div className="text-xs opacity-60">{item.category}</div>
                  </td>
                  <td>${item.price}</td>
                  <td>v{item.version ?? 1}</td>
                  <td>
                    <input
                      className="input input-bordered input-xs w-24"
                      type="number"
                      min="0"
                      value={priceDrafts[item.id] ?? ""}
                      placeholder={String(item.price)}
                      disabled={!canManageMenu}
                      onChange={(event) =>
                        setPriceDrafts((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                    />
                  </td>
                  <td>
                    <input
                      className="input input-bordered input-xs min-w-48"
                      value={reasonDrafts[item.id] ?? ""}
                      placeholder={"\u4f8b\uff1a\u539f\u7269\u6599\u6210\u672c\u8abf\u6574"}
                      disabled={!canManageMenu}
                      onChange={(event) =>
                        setReasonDrafts((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                    />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {canManageMenu ? (
                        <button
                          className="btn btn-xs btn-primary"
                          disabled={busyKey === `price:${item.id}`}
                          onClick={() => void submitPriceUpdate(item)}
                        >
                          {busyKey === `price:${item.id}`
                            ? "\u66f4\u65b0\u4e2d..."
                            : "\u66f4\u65b0\u50f9\u683c"}
                        </button>
                      ) : null}
                      <button
                        className="btn btn-xs btn-outline"
                        disabled={busyKey === `history:${item.id}`}
                        onClick={() => void toggleHistory(item.id)}
                      >
                        {history
                          ? "\u6536\u8d77\u7d00\u9304"
                          : "\u50f9\u683c\u7d00\u9304"}
                      </button>
                    </div>

                    {history ? (
                      <div className="mt-3 overflow-x-auto rounded border border-base-300">
                        <table className="table table-xs">
                          <thead>
                            <tr>
                              <th>{"\u7248\u672c"}</th>
                              <th>{"\u50f9\u683c"}</th>
                              <th>{"\u539f\u56e0"}</th>
                              <th>{"\u6642\u9593"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {history.map((version) => (
                              <tr key={version.id}>
                                <td>
                                  v{version.version ?? 1}
                                  {version.isCurrentVersion
                                    ? " \u76ee\u524d"
                                    : ""}
                                </td>
                                <td>${version.price}</td>
                                <td className="max-w-56 truncate">
                                  {version.changeReason ?? "-"}
                                </td>
                                <td>{formatDate(version.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmployeeManager({
  currentUserId,
  users,
  loading,
  updatingUserId,
  onReload,
  onUpdateUserRoles,
}: {
  currentUserId: string;
  users: SessionUser[];
  loading: boolean;
  updatingUserId: string | null;
  onReload: () => Promise<void>;
  onUpdateUserRoles: (userId: string, roles: Role[]) => Promise<void>;
}) {
  const positions: Role[] = ["customer", "staff", "chef", "owner", "admin"];

  function currentPosition(target: SessionUser): Role {
    if (target.roles.includes("admin")) return "admin";
    if (target.roles.includes("owner")) return "owner";
    if (target.roles.includes("chef")) return "chef";
    if (target.roles.includes("staff")) return "staff";
    return "customer";
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">員工職位管理</h3>
        <button
          className="btn btn-xs btn-outline"
          disabled={loading}
          onClick={() => void onReload()}
        >
          {loading ? "刷新中..." : "刷新員工"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>姓名</th>
              <th>Email</th>
              <th>目前職位</th>
              <th>改職位</th>
              <th>開除</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={5}>目前沒有使用者資料。</td>
              </tr>
            ) : (
              users.map((target) => {
                const position = currentPosition(target);
                const isSelf = target.id === currentUserId;
                const isUpdating = updatingUserId === target.id;

                return (
                  <tr key={target.id}>
                    <td>{target.name}</td>
                    <td className="max-w-[14rem] truncate">{target.email}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {target.roles.map((role) => (
                          <span key={role} className="badge badge-outline">
                            {roleLabel(role)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <select
                        className="select select-bordered select-xs"
                        value={position}
                        disabled={isSelf || isUpdating}
                        onChange={(event) =>
                          void onUpdateUserRoles(
                            target.id,
                            staffRolesFor(event.target.value as Role),
                          )
                        }
                      >
                        {positions.map((role) => (
                          <option key={role} value={role}>
                            {roleLabel(role)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        className="btn btn-xs btn-error btn-outline"
                        disabled={isSelf || isUpdating || position === "customer"}
                        onClick={() =>
                          void onUpdateUserRoles(target.id, ["customer"])
                        }
                      >
                        {isUpdating ? "處理中..." : "開除"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs opacity-60">
        為了避免管理員把自己鎖在外面，不能在這裡修改自己的職位。
      </p>
    </div>
  );
}

function RoleRequestReview({
  roleRequests,
  loading,
  reviewingRoleRequestId,
  clearingRoleRequests,
  onReload,
  onClear,
  onReviewRoleRequest,
}: {
  roleRequests: RoleRequest[];
  loading: boolean;
  reviewingRoleRequestId: number | null;
  clearingRoleRequests: boolean;
  onReload: () => Promise<void>;
  onClear: () => Promise<void>;
  onReviewRoleRequest: (
    requestId: number,
    status: "approved" | "rejected",
  ) => Promise<void>;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">角色申請審核</h3>
        <button
          className="btn btn-xs btn-outline"
          disabled={loading}
          onClick={() => void onReload()}
        >
          {loading ? "刷新中..." : "刷新申請"}
        </button>
      </div>

      <div className="flex justify-end">
        <button
          className="btn btn-xs btn-error btn-outline"
          disabled={loading || clearingRoleRequests || roleRequests.length === 0}
          onClick={() => void onClear()}
        >
          {clearingRoleRequests
            ? "\u6e05\u7a7a\u4e2d..."
            : "\u6e05\u7a7a\u7533\u8acb"}
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
                  <td className="max-w-[12rem] truncate">{request.userId}</td>
                  <td>{roleRequestLabel(request.requestedRole)}</td>
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
  if (grouped.length === 0) {
    return (
      <section className="rounded-lg border border-base-300 bg-base-100 p-6 text-center shadow-sm">
        <h2 className="text-lg font-bold">找不到符合的餐點</h2>
        <p className="mt-2 text-sm opacity-70">換個關鍵字再試試看。</p>
      </section>
    );
  }

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
                  <div className="flex flex-wrap gap-2">
                    {item.version ? (
                      <span className="badge badge-outline">v{item.version}</span>
                    ) : null}
                    {item.isRecentlyUpdated ? (
                      <span className="badge badge-info">
                        {"\u6700\u8fd1\u66f4\u65b0"}
                      </span>
                    ) : null}
                    {item.priceChanged && item.previousPrice ? (
                      <span className="badge badge-warning">
                        {"\u539f\u50f9"} ${item.previousPrice}
                      </span>
                    ) : null}
                  </div>
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
