import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysia/cors";
import { existsSync } from "node:fs";
import toTaipeiDateTime from "./util.ts";
import {
  apiErrorResponseSchema,
  createMenuItemBodySchema,
  deleteMenuItemParamsSchema,
  getOrderByIdParamsSchema,
  healthResponseSchema,
  menuItemResponseSchema,
  menuListResponseSchema,
  nullableOrderResponseEnvelopeSchema,
  orderListResponseSchema,
  orderResponseEnvelopeSchema,
  submitOrderParamsSchema,
  toOrderResponse,
  updateMenuItemBodySchema,
  updateMenuItemParamsSchema,
  updateOrderBodySchema,
  updateOrderParamsSchema,
} from "./shared/route-schemas.ts";
import { createStore } from "./store/index.ts";
import { auth, getCurrentUser } from "./auth/better-auth.ts";


// 從環境變量獲取配置
const port = parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "localhost";
const allowedOrigin = process.env.API_ALLOWED_ORIGIN || "http://localhost:5173"; // 💡 預設精準指向前端
const store = createStore({ dataFilePath: "./data/store.json" });
const hasPublicAssets =
  existsSync("./public") && existsSync("./public/index.html");

// ─── V10 RBAC 核心安全守衛 (Middleware / Guard) ──────────────────────────────

/**
 * 守衛一：強制要求登入
 */
async function requireUser(request: Request) {
  const user = await getCurrentUser(request);
  if (!user) {
    throw new Response(JSON.stringify({ error: "Unauthorized", message: "請先登入系統" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

/**
 * 守衛二：多重角色聯集檢查 (講義 Q5 技術要點 💡)
 * 採用 OR 邏輯，只要使用者具備其中一個指定角色即安全通關。
 */
async function requireAnyRole(request: Request, allowedRoles: Role[]) {
  const user = await requireUser(request);
  
  // 💡 安全防禦：防範資料庫中 roles 欄位異常為空或未定義
  const userRoles = user.roles || ["customer"]; 

  // 檢查是否有交集 (OR 邏輯)
  const hasPermission = userRoles.some((role) => allowedRoles.includes(role as Role));

  if (!hasPermission) {
    throw new Response(
      JSON.stringify({ 
        error: "Forbidden", 
        message: `權限不足。此操作需要以下角色之一: [${allowedRoles.join(", ")}]，但您目前的身分為: [${userRoles.join(", ")}]` 
      }), 
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
  return user;
}
export type Role = "customer" | "staff" | "chef" | "owner" | "admin";
const app = new Elysia();

// ─── CORS 跨域設定 ────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true, // 💡 處理 Google 登入 Cookie 的必備金鑰
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// ─── Better Auth 核心路由匹配 ──────────────────────────────────────────────────
app.get("/api/auth/*", ({ request }) => auth.handler(request));
app.post("/api/auth/*", ({ request }) => auth.handler(request));

// ─── OpenAPI 文件自動生成 ─────────────────────────────────────────────────────
app.use(
  openapi({
    path: "/openapi",
    specPath: "/openapi/json",
    documentation: {
      info: {
        title: "Breakfast Master RBAC API",
        version: "1.0.0",
        description: "V10 早餐店多重角色權限系統（RBAC）與訂單快照設計。完全符合架構講義規範。",
      },
      tags: [
        { name: "auth", description: "身份驗證端點" },
        { name: "menu", description: "菜單管理（受角色權限嚴格控制）" },
        { name: "orders", description: "訂單業務邏輯隔離端點" },
        { name: "system", description: "系統狀態端點" },
      ],
    },
    exclude: {
      staticFile: true,
      paths: ["/openapi", "/openapi/json"],
    },
  }),
);

// ─── 請求日誌紀錄中間件 ───────────────────────────────────────────────────────
app.onRequest(({ request }) => {
  console.log(
    `[${toTaipeiDateTime(new Date().toISOString())}] ${request.method} ${new URL(request.url).pathname}`,
  );
});

// ─── 登出安全代理 (Sign-out Proxy) ────────────────────────────────────────────
app.post("/api/sign-out", async ({ request }) => {
  const baBaseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const proxiedHeaders = new Headers(request.headers);
  proxiedHeaders.set("origin", baBaseUrl);

  const proxiedRequest = new Request(`${baBaseUrl}/api/auth/sign-out`, {
    method: "POST",
    headers: proxiedHeaders,
  });

  const res = await auth.handler(proxiedRequest);
  if (!res.ok) {
    const body = await res.clone().text().catch(() => "(unreadable)");
    console.error(`[sign-out proxy] Better Auth 轉發登出失敗 ${res.status}:`, body);
  }
  return res;
});

// ─── 🍔 菜單路由區（RBAC 權限精準隔離） ───────────────────────────────────────

// 所有身分（包含未登入的訪客）皆可看菜單
app.get("/api/menu", () => ({ data: [...store.getMenu()] }), {
  detail: { tags: ["menu"], summary: "瀏覽菜單" },
  response: { 200: menuListResponseSchema },
});

// 💡 講義規格：只有 admin 或 owner 可以新增菜單
app.post(
  "/api/menu",
  async ({ body, request, set }) => {
    await requireAnyRole(request, ["admin", "owner"]); // 👈 嚴格權限防禦壁壘
    
    const newMenuItem = await store.createMenuItem(body);
    set.status = 201;
    return { data: newMenuItem };
  },
  {
    body: createMenuItemBodySchema,
    detail: { tags: ["menu"], summary: "【管理員/店長】新增菜單項目" },
    response: { 201: menuItemResponseSchema },
  },
);

// 💡 講義規格：只有 admin 或 owner 可以修改菜單
app.patch(
  "/api/menu/:id",
  async ({ params, body, request, set }) => {
    await requireAnyRole(request, ["admin", "owner"]); // 👈 嚴格權限防禦壁壘
    
    const menuId = parseInt(params.id);
    const menuItem = await store.updateMenuItem(menuId, body);

    if (!menuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }
    return { data: menuItem };
  },
  {
    params: updateMenuItemParamsSchema,
    body: updateMenuItemBodySchema,
    detail: { tags: ["menu"], summary: "【管理員/店長】修改菜單項目" },
    response: { 200: menuItemResponseSchema, 404: apiErrorResponseSchema },
  },
);

// 💡 講義規格：只有 admin 或 owner 可以刪除菜單
app.delete(
  "/api/menu/:id",
  async ({ params, request, set }) => {
    await requireAnyRole(request, ["admin", "owner"]); // 👈 嚴格權限防禦壁壘
    
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
    detail: { tags: ["menu"], summary: "【管理員/店長】刪除菜單項目" },
    response: { 200: menuItemResponseSchema, 404: apiErrorResponseSchema },
  },
);

// ─── 📦 訂單路由區（RBAC 業務邊界數據隔離） ───────────────────────────────────

// 💡 講義核心規格：數據查看隔離。
// 店長(owner)、管理員(admin)、廚師(chef)與店員(staff)可查看全店訂單；普通顧客只能看自己的。
app.get(
  "/api/orders",
  async ({ request }) => {
    const user = await requireUser(request);
    const userRoles = user.roles || ["customer"];
    
    // 檢查是否屬於內部工作團隊
    const isStaffTeam = userRoles.some((role) => ["admin", "owner", "chef", "staff"].includes(role));

    if (isStaffTeam) {
      // 團隊成員：撈取全店所有訂單
      return { data: store.getOrders().map(toOrderResponse) };
    } else {
      // 普通顧客：自動向下收攏，只安全地回傳他自己的歷史訂單
      return { data: store.getOrderHistoryByUserId(user.id).map(toOrderResponse) };
    }
  },
  {
    detail: { tags: ["orders"], summary: "查詢訂單列表 (依角色自動權限分流)" },
    response: { 200: orderListResponseSchema },
  },
);

// 取得當前進行中（未送出）的購物車訂單
app.get(
  "/api/orders/current",
  async ({ request }) => {
    const user = await requireUser(request);
    const currentOrder = store.getCurrentOrderByUserId(user.id);
    return { data: currentOrder ? toOrderResponse(currentOrder) : null };
  },
  {
    detail: { tags: ["orders"], summary: "獲取目前進行中的購物車" },
    response: { 200: nullableOrderResponseEnvelopeSchema, 401: apiErrorResponseSchema },
  },
);

// 取得使用者歷史訂單
app.get(
  "/api/orders/history",
  async ({ request }) => {
    const user = await requireUser(request);
    return { data: store.getOrderHistoryByUserId(user.id).map(toOrderResponse) };
  },
  {
    detail: { tags: ["orders"], summary: "獲取個人歷史訂單" },
    response: { 200: orderListResponseSchema, 401: apiErrorResponseSchema },
  },
);

// 創建或重用現有購物車
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
    detail: { tags: ["orders"], summary: "建立新訂單購物車" },
    response: { 200: orderResponseEnvelopeSchema, 201: orderResponseEnvelopeSchema, 401: apiErrorResponseSchema },
  },
);

// 獲取單筆訂單詳情 (嚴格比對擁有者或工作人員身分)
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

    // 💡 V10 縱深防禦：如果是本人，或者是非顧客的工作人員(Admin, Chef 等)，才可以放行查看
    const userRoles = user.roles || ["customer"];
    const isStaffTeam = userRoles.some((role) => ["admin", "owner", "chef", "staff"].includes(role));
    
    if (order.userId !== user.id && !isStaffTeam) {
      set.status = 403;
      return { error: "Forbidden", message: "您無權查看他人訂單" };
    }

    return { data: toOrderResponse(order) };
  },
  {
    params: getOrderByIdParamsSchema,
    detail: { tags: ["orders"], summary: "獲取單筆訂單詳情" },
    response: { 200: orderResponseEnvelopeSchema, 401: apiErrorResponseSchema, 403: apiErrorResponseSchema, 404: apiErrorResponseSchema },
  },
);

// 調整購物車內食物的數量
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

    if (!result.ok && result.code === "ORDER_NOT_FOUND") { set.status = 404; return { error: "Order not found" }; }
    if (!result.ok && result.code === "MENU_ITEM_NOT_FOUND") { set.status = 404; return { error: "Menu item not found" }; }
    if (!result.ok && result.code === "ORDER_NOT_OWNED") { set.status = 403; return { error: "Forbidden" }; }
    if (!result.ok && result.code === "ORDER_NOT_EDITABLE") { set.status = 409; return { error: "Order is not editable" }; }
    if (!result.ok) { set.status = 500; return { error: "Unexpected store state" }; }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: updateOrderParamsSchema,
    body: updateOrderBodySchema,
    detail: { tags: ["orders"], summary: "調整購物車項目數量" },
    response: { 200: orderResponseEnvelopeSchema, 401: apiErrorResponseSchema, 403: apiErrorResponseSchema, 404: apiErrorResponseSchema, 409: apiErrorResponseSchema, 500: apiErrorResponseSchema },
  },
);

// 提交結帳訂單 (此處會自動觸發資料庫內 order_items 表的不可變快照記錄 ✨)
app.post(
  "/api/orders/:id/submit",
  async ({ params, request, set }) => {
    const user = await requireUser(request);
    const orderId = parseInt(params.id, 10);
    const result = await store.submitOrder(orderId, { userId: user.id });

    if (!result.ok && result.code === "ORDER_NOT_FOUND") { set.status = 404; return { error: "Order not found" }; }
    if (!result.ok && result.code === "ORDER_NOT_OWNED") { set.status = 403; return { error: "Forbidden" }; }
    if (!result.ok && result.code === "ORDER_NOT_EDITABLE") { set.status = 409; return { error: "Order already submitted" }; }
    if (!result.ok && result.code === "EMPTY_ORDER") { set.status = 400; return { error: "Empty order cannot be submitted" }; }
    if (!result.ok) { set.status = 500; return { error: "Unexpected store state" }; }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: submitOrderParamsSchema,
    detail: { tags: ["orders"], summary: "送出訂單結帳" },
    response: { 200: orderResponseEnvelopeSchema, 400: apiErrorResponseSchema, 401: apiErrorResponseSchema, 403: apiErrorResponseSchema, 404: apiErrorResponseSchema, 409: apiErrorResponseSchema, 500: apiErrorResponseSchema },
  },
);

// ─── 🧪 系統路由與靜態資源 ────────────────────────────────────────────────────
app.get("/health", () => ({ status: "ok" }), {
  detail: { tags: ["system"], summary: "健康檢查" },
  response: { 200: healthResponseSchema },
});

if (hasPublicAssets) {
  app.get("*", async ({ request }) => {
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith("/api/") || pathname.startsWith("/openapi")) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const staticFile = Bun.file(`./public${pathname}`);
    if (pathname !== "/" && (await staticFile.exists())) {
      return staticFile;
    }
    return Bun.file("./public/index.html");
  });
}

// 全域驗證與錯誤捕捉
app.onError(({ error, set, code }) => {
  if (code === "VALIDATION") {
    set.status = 400;
    return { error: "Validation failed", message: "請檢查請求參數欄位規格是否相符" };
  }
  set.status = 500;
  return { error: "Internal server error" };
});

// 啟動伺服器
await store.init();
app.listen(port, () => {
  console.log(`🍳 早餐店 V10 RBAC API 運行在 http://${host}:${port}`);
  console.log(`🌐 Web App: http://${host}:${port}`);
});