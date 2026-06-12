import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysia/cors";
import { and, desc, eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import toTaipeiDateTime from "./util.ts";
import {
  apiErrorResponseSchema,
  createMenuItemBodySchema,
  createRoleRequestBodySchema,
  deleteMenuItemParamsSchema,
  getMenuHistoryParamsSchema,
  getOrderByIdParamsSchema,
  healthResponseSchema,
  listRoleRequestsQuerySchema,
  menuHistoryResponseSchema,
  menuItemResponseSchema,
  menuListResponseSchema,
  nullableOrderResponseEnvelopeSchema,
  orderListResponseSchema,
  orderResponseEnvelopeSchema,
  reviewRoleRequestBodySchema,
  reviewRoleRequestParamsSchema,
  roleRequestListResponseSchema,
  roleRequestResponseSchema,
  sessionUserResponseSchema,
  submitOrderParamsSchema,
  toOrderResponse,
  updateMenuItemBodySchema,
  updateMenuItemParamsSchema,
  updateOrderBodySchema,
  updateOrderParamsSchema,
  updateUserRolesBodySchema,
  updateUserRolesParamsSchema,
} from "./shared/route-schemas.ts";
import { createStore } from "./store/index.ts";
import { auth, getCurrentUser } from "./auth/better-auth.ts";
import {
  canAccessResource,
  hasAnyRole,
  requireAnyRole,
  requireRole,
} from "./shared/guards.ts";
import { db } from "./db/client.ts";
import { roleRequestsTable } from "./db/schema.ts";
import { user as authUsers } from "./db/auth-schema.ts";
import type { RoleRequest } from "./shared/contracts.ts";

// 從環境變量獲取配置
const port = parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "localhost";
const allowedOrigin = process.env.API_ALLOWED_ORIGIN || "*";
const store = createStore({ dataFilePath: "./data/store.json" });
const hasPublicAssets =
  existsSync("./public") && existsSync("./public/index.html");

// ─── Auth Helper ──────────────────────────────────────────────────────────────
// 簡化的 helper 函數，用於保護路由並獲取 user，失敗時拋出 401 錯誤
async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

function toRoleRequestResponse(
  row: typeof roleRequestsTable.$inferSelect,
): RoleRequest {
  return {
    id: row.id,
    userId: row.userId,
    requestedRole: row.requestedRole as RoleRequest["requestedRole"],
    reason: row.reason,
    status: row.status as RoleRequest["status"],
    requestedAt:
      row.requestedAt instanceof Date
        ? row.requestedAt.toISOString()
        : new Date(row.requestedAt).toISOString(),
    reviewedBy: row.reviewedBy ?? undefined,
    reviewedAt: row.reviewedAt
      ? row.reviewedAt instanceof Date
        ? row.reviewedAt.toISOString()
        : new Date(row.reviewedAt).toISOString()
      : undefined,
    reviewNote: row.reviewNote ?? undefined,
  };
}

const app = new Elysia();

// ─── CORS Plugin ──────────────────────────────────────────────────────────────
app.use(
  cors({
    origin:
      allowedOrigin === "*" ? "*" : allowedOrigin || "http://localhost:5173",
    credentials: allowedOrigin !== "*",
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ─── Better Auth Routes ───────────────────────────────────────────────────────
// ⚠️ 注意：不能使用 app.mount("/api/auth", auth.handler)
// 原因：Better Auth handler 是標準的 fetch handler function，
//       但 Elysia 的 .mount() 期望的是 Elysia instance 或特定格式的 handler。
//       測試結果：.mount() 會導致 404 錯誤。
//
// ✅ 正確做法：使用 wildcard 路由明確處理 GET 和 POST
// 必須在其他 API 路由之前定義，確保 Better Auth 路由優先匹配
app.get("/api/auth/*", ({ request }) => auth.handler(request));
app.post("/api/auth/*", ({ request }) => auth.handler(request));

// ─── OpenAPI Plugin ───────────────────────────────────────────────────────────
app.use(
  openapi({
    path: "/openapi",
    specPath: "/openapi/json",
    documentation: {
      info: {
        title: "Breakfast Demo API",
        version: "0.2.3",
        description:
          "Breakfast ordering demo API for teaching route schema, contract-first design, and future database/auth upgrades. V9-clean-better-auth-v3: optimized static handling, CORS plugin, and Better Auth macro integration.",
      },
      tags: [
        { name: "auth", description: "Authentication endpoints" },
        { name: "users", description: "User self-service endpoints" },
        { name: "admin", description: "Admin RBAC endpoints" },
        { name: "menu", description: "Menu management endpoints" },
        { name: "orders", description: "Order query and mutation endpoints" },
        { name: "system", description: "System and health check endpoints" },
      ],
    },
    exclude: {
      staticFile: true,
      paths: ["/openapi", "/openapi/json"],
    },
  }),
);

// 請求記錄中間件
// ─── Request Logger ───────────────────────────────────────────────────────────
app.onRequest(({ request }) => {
  console.log(
    `[${toTaipeiDateTime(new Date().toISOString())}] ${request.method} ${new URL(request.url).pathname}`,
  );
});

// API 路由

// ─── Sign-out Proxy ───────────────────────────────────────────────────────────
// Better Auth 的 /api/auth/sign-out 有 CSRF origin 驗證（比對 trustedOrigins）。
// production 環境若 BETTER_AUTH_URL 設定錯誤（如仍是 localhost），
// 瀏覽器送出的 Origin（正式網址）不在白名單，導致 sign-out 回 403 但前端不知道，
// 造成「看似登出，實際 session 仍在」的假登出。
//
// 解法：在 Elysia 層加一個 proxy，以 server 信任的 baseURL 當 Origin 轉發給 Better Auth。
// 安全性：session 識別仍靠 cookie，CSRF bypass 只在 server 端發生，不降低安全性。
app.post("/api/sign-out", async ({ request }) => {
  const baBaseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  // 複製原始 headers，強制覆寫 origin 為 Better Auth 信任的 baseURL
  const proxiedHeaders = new Headers(request.headers);
  proxiedHeaders.set("origin", baBaseUrl);

  const proxiedRequest = new Request(`${baBaseUrl}/api/auth/sign-out`, {
    method: "POST",
    headers: proxiedHeaders,
  });

  const res = await auth.handler(proxiedRequest);
  if (!res.ok) {
    const body = await res
      .clone()
      .text()
      .catch(() => "(unreadable)");
    console.error(`[sign-out proxy] Better Auth returned ${res.status}:`, body);
  }
  return res;
});

// 菜單路由
app.get(
  "/api/users/me",
  async ({ request }) => {
    const user = await requireUser(request);
    return { data: user };
  },
  {
    detail: {
      tags: ["users"],
      summary: "Get current session user",
    },
    response: {
      200: sessionUserResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

app.get("/api/menu", () => ({ data: [...store.getMenu()] }), {
  detail: {
    tags: ["menu"],
    summary: "List menu items",
    description: "Return all available breakfast menu items.",
  },
  response: {
    200: menuListResponseSchema,
  },
});

app.post(
  "/api/menu",
  async ({ body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, ["owner", "admin"]);

    const newMenuItem = await store.createMenuItem(body);
    set.status = 201;
    return { data: newMenuItem };
  },
  {
    body: createMenuItemBodySchema,
    detail: {
      tags: ["menu"],
      summary: "Create a menu item",
      description: "Add a new menu item into the breakfast menu.",
    },
    response: {
      201: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/menu/:id",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, ["owner", "admin"]);

    const menuId = parseInt(params.id);
    const menuItem = await store.updateMenuItem(menuId, body, {
      userId: user.id,
    });

    if (!menuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: menuItem };
  },
  {
    params: updateMenuItemParamsSchema,
    body: updateMenuItemBodySchema,
    detail: {
      tags: ["menu"],
      summary: "Update a menu item",
      description: "Update fields of an existing menu item.",
    },
    response: {
      200: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/menu/:id/history",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, ["staff", "chef", "owner", "admin"]);

    const menuId = parseInt(params.id, 10);
    const history = await store.getMenuVersionHistory?.(menuId);

    if (!history || history.length === 0) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: history };
  },
  {
    params: getMenuHistoryParamsSchema,
    detail: {
      tags: ["menu"],
      summary: "List menu item version history",
      description:
        "Return historical versions for a menu item. Available to staff, chef, owner, and admin users.",
    },
    response: {
      200: menuHistoryResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.delete(
  "/api/menu/:id",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    requireAnyRole(user, ["owner", "admin"]);

    const menuId = parseInt(params.id);
    const removedMenuItem = await store.deleteMenuItem(menuId);

    if (!removedMenuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: removedMenuItem };
  },
  {
    params: deleteMenuItemParamsSchema,
    detail: {
      tags: ["menu"],
      summary: "Delete a menu item",
      description: "Remove a menu item by id.",
    },
    response: {
      200: menuItemResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 訂單列表路由
app.get(
  "/api/orders",
  async ({ request }) => {
    const user = await requireUser(request);
    const orders = hasAnyRole(user, ["staff", "chef", "owner", "admin"])
      ? store.getOrders()
      : store.getOrders().filter((order) => order.userId === user.id);

    return {
      data: orders.map(toOrderResponse),
    };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "List all orders",
      description: "Return all orders stored in the demo backend.",
    },
    response: {
      200: orderListResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 取得使用者目前進行中的訂單
app.get(
  "/api/orders/current",
  async ({ request }) => {
    const user = await requireUser(request);
    const currentOrder = store.getCurrentOrderByUserId(user.id);
    return { data: currentOrder ? toOrderResponse(currentOrder) : null };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Get current order",
      description:
        "Return the current pending order of a user, or null if none exists.",
    },
    response: {
      200: nullableOrderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 取得使用者歷史訂單
app.get(
  "/api/orders/history",
  async ({ request }) => {
    const user = await requireUser(request);
    return {
      data: store.getOrderHistoryByUserId(user.id).map(toOrderResponse),
    };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Get order history",
      description: "Return submitted orders belonging to a user.",
    },
    response: {
      200: orderListResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 創建新訂單
app.post(
  "/api/orders",
  async ({ request, set }) => {
    const user = await requireUser(request);
    const existingOrder = store.getCurrentOrderByUserId(user.id);
    if (existingOrder) {
      return { data: toOrderResponse(existingOrder) };
    }

    const newOrder = await store.createOrder({ userId: user.id });
    set.status = 201;
    return { data: toOrderResponse(newOrder) };
  },
  {
    detail: {
      tags: ["orders"],
      summary: "Create or reuse current order",
      description:
        "Create a new pending order, or return the existing pending order for the user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      201: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 獲取單筆訂單
app.get(
  "/api/orders/:id",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const order = store.getOrderById(orderId);

    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (!canAccessResource(user, order.userId)) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    return { data: toOrderResponse(order) };
  },
  {
    params: getOrderByIdParamsSchema,
    detail: {
      tags: ["orders"],
      summary: "Get order by id",
      description:
        "Return a single order when it belongs to the requested user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 更新訂單項目
app.patch(
  "/api/orders/:id",
  async ({ params, body, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id);
    const result = await store.updateOrderItem(orderId, {
      userId: user.id,
      itemId: body.itemId,
      qty: body.qty,
    });

    if (!result.ok && result.code === "ORDER_NOT_FOUND") {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (!result.ok && result.code === "MENU_ITEM_NOT_FOUND") {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    if (!result.ok && result.code === "ORDER_NOT_OWNED") {
      set.status = 403;
      return { error: "Forbidden" };
    }

    if (!result.ok && result.code === "ORDER_NOT_EDITABLE") {
      set.status = 409;
      return { error: "Order is not editable" };
    }

    if (!result.ok) {
      set.status = 500;
      return { error: "Unexpected store state" };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: updateOrderParamsSchema,
    body: updateOrderBodySchema,
    detail: {
      tags: ["orders"],
      summary: "Update order item quantity",
      description: "Set the quantity of a menu item within a pending order.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// 送出訂單
app.post(
  "/api/orders/:id/submit",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const result = await store.submitOrder(orderId, { userId: user.id });

    if (!result.ok && result.code === "ORDER_NOT_FOUND") {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (!result.ok && result.code === "ORDER_NOT_OWNED") {
      set.status = 403;
      return { error: "Forbidden" };
    }

    if (!result.ok && result.code === "ORDER_NOT_EDITABLE") {
      set.status = 409;
      return { error: "Order already submitted" };
    }

    if (!result.ok && result.code === "EMPTY_ORDER") {
      set.status = 400;
      return { error: "Empty order cannot be submitted" };
    }

    if (!result.ok && result.code === "MENU_VERSION_OUTDATED") {
      set.status = 409;
      return {
        error: "Cart contains outdated menu items. Please refresh your cart.",
      };
    }

    if (!result.ok) {
      set.status = 500;
      return { error: "Unexpected store state" };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: submitOrderParamsSchema,
    detail: {
      tags: ["orders"],
      summary: "Submit order",
      description: "Submit a pending order that belongs to the user.",
    },
    response: {
      200: orderResponseEnvelopeSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// 健康檢查路由
// 角色申請與管理
app.post(
  "/api/users/me/role-request",
  async ({ request, body, set }) => {
    const user = await requireUser(request);

    const [existingRequest] = await db
      .select()
      .from(roleRequestsTable)
      .where(
        and(
          eq(roleRequestsTable.userId, user.id),
          eq(roleRequestsTable.status, "pending"),
        ),
      )
      .limit(1);

    if (existingRequest) {
      set.status = 400;
      return { error: "You already have a pending role request" };
    }

    const [newRequest] = await db
      .insert(roleRequestsTable)
      .values({
        userId: user.id,
        requestedRole: body.requestedRole,
        reason: body.reason,
      })
      .returning();

    if (!newRequest) {
      set.status = 500;
      return { error: "Failed to create role request" };
    }

    set.status = 201;
    return { data: toRoleRequestResponse(newRequest) };
  },
  {
    body: createRoleRequestBodySchema,
    detail: {
      tags: ["users"],
      summary: "Request a staff or chef role",
    },
    response: {
      201: roleRequestResponseSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.get(
  "/api/admin/role-requests",
  async ({ request, query }) => {
    const user = await requireUser(request);
    requireRole(user, "admin");

    const rows =
      query.status && query.status !== "all"
        ? await db
            .select()
            .from(roleRequestsTable)
            .where(eq(roleRequestsTable.status, query.status))
            .orderBy(desc(roleRequestsTable.requestedAt))
        : await db
            .select()
            .from(roleRequestsTable)
            .orderBy(desc(roleRequestsTable.requestedAt));

    return { data: rows.map(toRoleRequestResponse) };
  },
  {
    query: listRoleRequestsQuerySchema,
    detail: {
      tags: ["admin"],
      summary: "List role requests",
    },
    response: {
      200: roleRequestListResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/admin/role-requests/:id",
  async ({ request, params, body, set }) => {
    const user = await requireUser(request);
    requireRole(user, "admin");

    const requestId = parseInt(params.id, 10);
    const [existingRequest] = await db
      .select()
      .from(roleRequestsTable)
      .where(eq(roleRequestsTable.id, requestId))
      .limit(1);

    if (!existingRequest) {
      set.status = 404;
      return { error: "Role request not found" };
    }

    if (existingRequest.status !== "pending") {
      set.status = 400;
      return { error: "This request has already been reviewed" };
    }

    const [updatedRequest] = await db
      .update(roleRequestsTable)
      .set({
        status: body.status,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote,
      })
      .where(eq(roleRequestsTable.id, requestId))
      .returning();

    if (!updatedRequest) {
      set.status = 500;
      return { error: "Failed to review role request" };
    }

    if (body.status === "approved") {
      const [targetUser] = await db
        .select({ roles: authUsers.roles })
        .from(authUsers)
        .where(eq(authUsers.id, existingRequest.userId))
        .limit(1);

      if (targetUser) {
        const nextRoles = Array.from(
          new Set([...targetUser.roles, existingRequest.requestedRole]),
        );

        await db
          .update(authUsers)
          .set({ roles: nextRoles, updatedAt: new Date() })
          .where(eq(authUsers.id, existingRequest.userId));
      }
    }

    return { data: toRoleRequestResponse(updatedRequest) };
  },
  {
    params: reviewRoleRequestParamsSchema,
    body: reviewRoleRequestBodySchema,
    detail: {
      tags: ["admin"],
      summary: "Review a role request",
    },
    response: {
      200: roleRequestResponseSchema,
      400: apiErrorResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

app.patch(
  "/api/admin/users/:userId/roles",
  async ({ request, params, body, set }) => {
    const user = await requireUser(request);
    requireRole(user, "admin");

    const [updatedUser] = await db
      .update(authUsers)
      .set({ roles: body.roles, updatedAt: new Date() })
      .where(eq(authUsers.id, params.userId))
      .returning();

    if (!updatedUser) {
      set.status = 404;
      return { error: "User not found" };
    }

    return {
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        roles: updatedUser.roles,
      },
    };
  },
  {
    params: updateUserRolesParamsSchema,
    body: updateUserRolesBodySchema,
    detail: {
      tags: ["admin"],
      summary: "Set user roles",
    },
    response: {
      200: sessionUserResponseSchema,
      401: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.get("/health", () => ({ status: "ok" }), {
  detail: {
    tags: ["system"],
    summary: "Health check",
    description: "Return API health status.",
  },
  response: {
    200: healthResponseSchema,
  },
});

// ─── Manual Static File & SPA Fallback ────────────────────────────────────────
// 完全手動處理靜態檔案和 SPA fallback，避免 staticPlugin 的路由衝突問題
if (hasPublicAssets) {
  app.get("*", async ({ request }) => {
    const pathname = new URL(request.url).pathname;

    // API 路徑返回 404
    if (pathname.startsWith("/api/") || pathname.startsWith("/openapi")) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 嘗試回傳對應的靜態檔案
    const staticFile = Bun.file(`./public${pathname}`);
    if (pathname !== "/" && (await staticFile.exists())) {
      return staticFile;
    }

    // SPA fallback: 回傳 index.html
    return Bun.file("./public/index.html");
  });
}

// 全域錯誤處理
app.onError(({ error, set, code }) => {
  if (error instanceof Response) {
    return error;
  }

  if (code === "VALIDATION") {
    set.status = 400;
    return {
      error: "Validation failed",
      message: "Please check your request parameters",
    };
  }

  set.status = 500;
  return { error: "Internal server error" };
});

// 啟動服務器
await store.init();

app.listen(port, () => {
  console.log(`🍳 早餐店 API 運行在 http://${host}:${port}`);
  console.log(`🌐 Web App: http://${host}:${port}`);
  console.log(`📋 菜單 API: http://${host}:${port}/api/menu`);
  console.log(`📦 訂單 API: http://${host}:${port}/api/orders`);
  console.log(`💚 健康檢查: http://${host}:${port}/health`);
  console.log(`🔐 CORS Origin: ${allowedOrigin}`);
  if (!hasPublicAssets) {
    console.log(
      "⚠️ public/ 不存在，目前只提供 API。若要提供前端頁面，先執行 bun run build:frontend",
    );
  }
});
