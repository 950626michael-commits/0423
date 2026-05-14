import { Elysia, t } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import { existsSync } from "node:fs";
import toTaipeiDateTime from "./util.ts";
import type { Order, OrderResponse } from "./legacy/v8/contracts.ts";
import { createStoreV8 } from "./legacy/v8/store/index.ts";

// --- 1. 定義輔助工具與 Schema ---

function toOrderResponse(order: Order): OrderResponse {
  return {
    ...order,
    createdAtTaipei: toTaipeiDateTime(order.createdAt),
  };
}

/** 
 * 定義標準錯誤回應格式
 * 讓前端與測試程式有統一的判斷標準
 */
const errorResponseSchema = t.Object({
  error: t.String(),
});

const safeUserSchema = t.Object({
  id: t.Number({ minimum: 1 }),
  email: t.String({ minLength: 3 }),
  name: t.String({ minLength: 1 }),
});

const menuItemSchema = t.Object({
  id: t.Number({ minimum: 1 }),
  name: t.String({ minLength: 1 }),
  price: t.Number({ minimum: 0 }),
  category: t.String({ minLength: 1 }),
  description: t.String(),
  image_url: t.String({ minLength: 1 }),
});

const orderItemSchema = t.Object({
  item: menuItemSchema,
  qty: t.Number({ minimum: 0 }),
});

const orderResponseSchema = t.Object({
  id: t.Number({ minimum: 1 }),
  userId: t.Number({ minimum: 1 }),
  items: t.Array(orderItemSchema),
  total: t.Number({ minimum: 0 }),
  status: t.Union([t.Literal("pending"), t.Literal("submitted")]),
  createdAt: t.String({ minLength: 1 }),
  submittedAt: t.Optional(t.String({ minLength: 1 })),
  createdAtTaipei: t.String({ minLength: 1 }),
});

// --- 2. 初始化應用與存儲 ---

const port = parseInt(process.env.PORT || "3010", 10);
const host = process.env.HOST || "localhost";
const allowedOrigin = process.env.API_ALLOWED_ORIGIN || "*";
const databaseUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_URL_MIGRATION ?? process.env.DATABASE_URL;
const hasPublicAssets = existsSync("./public") && existsSync("./public/index.html");

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required for backend.v8.ts. Set it in .env before starting.",
  );
}

if (!migrationUrl) {
  console.warn(
    "DATABASE_URL_MIGRATION is not set. drizzle-kit will fallback to DATABASE_URL if needed.",
  );
}

const store = createStoreV8();
const app = new Elysia();

// --- 3. 中間件與 CORS 處理 ---

if (hasPublicAssets) {
  app.use(staticPlugin({ assets: "public", prefix: "" }));
}

app.onRequest(({ request }) => {
  console.log(
    `[${toTaipeiDateTime(new Date().toISOString())}] ${request.method} ${new URL(request.url).pathname}`,
  );
});

app.options("*", ({ set }) => {
  set.status = 204;
  return "";
});

app.onAfterHandle(({ request, set }) => {
  const requestOrigin = request.headers.get("origin");
  if (allowedOrigin === "*") {
    set.headers["access-control-allow-origin"] = requestOrigin || "*";
  } else if (requestOrigin === allowedOrigin) {
    set.headers["access-control-allow-origin"] = allowedOrigin;
  }
  set.headers.vary = "Origin";
  set.headers["access-control-allow-methods"] = "GET,POST,PATCH,DELETE,OPTIONS";
  set.headers["access-control-allow-headers"] = "Content-Type, Authorization";
});

// --- 4. 路由實作 (帶有完整 API Contract) ---

app.post(
  "/api/auth/login",
  async ({ body, set }) => {
    const result = await store.login({
      email: body.email,
      password: body.password,
    });

    if (!result.ok) {
      set.status = 401;
      return { error: "Invalid credentials" };
    }

    return { data: result.user };
  },
  {
    body: t.Object({
      email: t.String({ minLength: 3 }),
      password: t.String({ minLength: 1 }),
    }),
    response: {
      200: t.Object({ data: safeUserSchema }),
      401: errorResponseSchema,
    },
    detail: { summary: "用戶登入" }
  },
);

app.get(
  "/api/menu", 
  async () => ({ data: [...(await store.getMenu())] }), 
  {
    response: { 
      200: t.Object({ data: t.Array(menuItemSchema) }) 
    },
    detail: { summary: "獲取菜單列表" }
  }
);

app.get(
  "/api/orders/current",
  async ({ query, set }) => {
    const userId = Number.parseInt(query.userId, 10);
    const user = await store.getUserById(userId);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const currentOrder = await store.getCurrentOrderByUserId(user.id);
    return { data: currentOrder ? toOrderResponse(currentOrder) : null };
  },
  {
    query: t.Object({ 
      userId: t.String({ pattern: "^[0-9]+$", description: "用戶 ID" }) 
    }),
    response: {
      200: t.Object({ data: t.Union([orderResponseSchema, t.Null()]) }),
      401: errorResponseSchema,
    },
    detail: { summary: "獲取當前未提交訂單" }
  },
);

app.get(
  "/api/orders/history",
  async ({ query, set }) => {
    const userId = Number.parseInt(query.userId, 10);
    const user = await store.getUserById(userId);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const historyOrders = await store.getOrderHistoryByUserId(user.id);
    return { data: historyOrders.map((order) => toOrderResponse(order)) };
  },
  {
    query: t.Object({ 
      userId: t.String({ pattern: "^[0-9]+$" }) 
    }),
    response: {
      200: t.Object({ data: t.Array(orderResponseSchema) }),
      401: errorResponseSchema,
    },
    detail: { summary: "獲取歷史訂單記錄" }
  },
);

app.post(
  "/api/orders",
  async ({ body, set }) => {
    const user = await store.getUserById(body.userId);

    if (!user) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const existing = await store.getCurrentOrderByUserId(user.id);
    if (existing) {
      return { data: toOrderResponse(existing) };
    }

    const createdOrder = await store.createOrder({ userId: user.id });
    set.status = 201;
    return { data: toOrderResponse(createdOrder) };
  },
  {
    body: t.Object({ userId: t.Number({ minimum: 1 }) }),
    response: {
      201: t.Object({ data: orderResponseSchema }),
      200: t.Object({ data: orderResponseSchema }), // 若已存在則回傳 200
      401: errorResponseSchema,
    },
    detail: { summary: "建立新訂單" }
  },
);

app.patch(
  "/api/orders/:id",
  async ({ params, body, set }) => {
    const orderId = Number.parseInt(params.id, 10);
    const result = await store.updateOrderItem(orderId, {
      userId: body.userId,
      itemId: body.itemId,
      qty: body.qty,
    });

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        ORDER_NOT_FOUND: 404,
        MENU_ITEM_NOT_FOUND: 404,
        ORDER_NOT_OWNED: 403,
        ORDER_ALREADY_SUBMITTED: 409
      };
      set.status = statusMap[result.code] || 409;
      return { error: result.code };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: t.Object({ id: t.String({ pattern: "^[0-9]+$" }) }),
    body: t.Object({
      userId: t.Number({ minimum: 1 }),
      itemId: t.Number({ minimum: 1 }),
      qty: t.Number({ minimum: 0 }),
    }),
    response: {
      200: t.Object({ data: orderResponseSchema }),
      403: errorResponseSchema,
      404: errorResponseSchema,
      409: errorResponseSchema,
    },
    detail: { summary: "更新訂單品項" }
  },
);

app.post(
  "/api/orders/:id/submit",
  async ({ params, body, set }) => {
    const orderId = Number.parseInt(params.id, 10);
    const result = await store.submitOrder(orderId, {
      userId: body.userId,
    });

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        ORDER_NOT_FOUND: 404,
        ORDER_NOT_OWNED: 403,
      };
      set.status = statusMap[result.code] || 409;
      return { error: result.code };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: t.Object({ id: t.String({ pattern: "^[0-9]+$" }) }),
    body: t.Object({ userId: t.Number({ minimum: 1 }) }),
    response: {
      200: t.Object({ data: orderResponseSchema }),
      403: errorResponseSchema,
      404: errorResponseSchema,
      409: errorResponseSchema,
    },
    detail: { summary: "提交訂單（結帳）" }
  },
);

// --- 5. 基礎功能與啟動 ---

app.get("/health", () => ({ status: "ok", mode: "v8-legacy" }), {
  response: t.Object({ status: t.String(), mode: t.String() })
});

if (hasPublicAssets) {
  app.get("/", () => Bun.file("./public/index.html"));
}

await store.init();

app.listen(port, () => {
  console.log(`🍳 V8 Legacy API 運行在 http://${host}:${port}`);
  console.log(`📋 菜單 API: http://${host}:${port}/api/menu`);
  console.log(`📦 訂單 API: http://${host}:${port}/api/orders`);
  console.log(`💚 健康檢查: http://${host}:${port}/health`);
  console.log(`🔌 Neon Database: ${databaseUrl ? "DATABASE_URL set" : "missing"}`);
  console.log(`🧩 Migration URL: ${migrationUrl ? "DATABASE_URL_MIGRATION set" : "missing"}`);
});