import { Elysia, t } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import toTaipeiDateTime from "./util.ts";
import type { Order, OrderResponse } from "./shared/contracts.ts";
import { createStore } from "./store/index.ts";

function toOrderResponse(order: Order): OrderResponse {
  return {
    ...order,
    createdAtTaipei: toTaipeiDateTime(order.createdAt),
  };
}

// 從環境變量獲取配置
const port = parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "localhost";
const allowedOrigin = process.env.API_ALLOWED_ORIGIN || "*";
const store = createStore({ dataFilePath: "./data/store.json" });

const apiErrorResponseSchema = t.Object({
  error: t.String(),
  message: t.Optional(t.String()),
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

const loginResponseSchema = t.Object({
  data: safeUserSchema,
});

const menuListResponseSchema = t.Object({
  data: t.Array(menuItemSchema),
});

const menuItemResponseSchema = t.Object({
  data: menuItemSchema,
});

const orderListResponseSchema = t.Object({
  data: t.Array(orderResponseSchema),
});

const orderResponseEnvelopeSchema = t.Object({
  data: orderResponseSchema,
});

const nullableOrderResponseEnvelopeSchema = t.Object({
  data: t.Union([orderResponseSchema, t.Null()]),
});

const healthResponseSchema = t.Object({
  status: t.String(),
});

const app = new Elysia();

app.use(
  staticPlugin({
    assets: "public",
    prefix: "",
  }),
);

// 請求記錄中間件
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
  } else {
    return;
  }

  set.headers.vary = "Origin";
  set.headers["access-control-allow-methods"] = "GET,POST,PATCH,DELETE,OPTIONS";
  set.headers["access-control-allow-headers"] = "Content-Type, Authorization";
});

// API 路由

// 使用者登入
app.post(
  "/api/auth/login",
  ({ body, set }) => {
    const result = store.login({
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
      200: loginResponseSchema,
      401: apiErrorResponseSchema,
    },
  },
);

// 菜單路由
app.get("/api/menu", () => ({ data: [...store.getMenu()] }), {
  response: {
    200: menuListResponseSchema,
  },
});

app.post(
  "/api/menu",
  async ({ body, set }) => {
    const newMenuItem = await store.createMenuItem(body);
    set.status = 201;
    return { data: newMenuItem };
  },
  {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      price: t.Integer({ minimum: 0 }),
      category: t.String({ minLength: 1 }),
      description: t.String({ minLength: 1 }),
      image_url: t.String({ minLength: 1 }),
    }),
    response: {
      201: menuItemResponseSchema,
    },
  },
);

app.patch(
  "/api/menu/:id",
  async ({ params, body, set }) => {
    const menuId = parseInt(params.id);
    const menuItem = await store.updateMenuItem(menuId, body);

    if (!menuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: menuItem };
  },
  {
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
    body: t.Object({
      name: t.Optional(t.String({ minLength: 1 })),
      price: t.Optional(t.Integer({ minimum: 0 })),
      category: t.Optional(t.String({ minLength: 1 })),
      description: t.Optional(t.String({ minLength: 1 })),
      image_url: t.Optional(t.String({ minLength: 1 })),
    }),
    response: {
      200: menuItemResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

app.delete(
  "/api/menu/:id",
  async ({ params, set }) => {
    const menuId = parseInt(params.id);
    const removedMenuItem = await store.deleteMenuItem(menuId);

    if (!removedMenuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    return { data: removedMenuItem };
  },
  {
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
    response: {
      200: menuItemResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 訂單列表路由
app.get(
  "/api/orders",
  () => ({
    data: store.getOrders().map(toOrderResponse),
  }),
  {
    response: {
      200: orderListResponseSchema,
    },
  },
);

// 取得使用者目前進行中的訂單
app.get(
  "/api/orders/current",
  ({ query, set }) => {
    const userId = parseInt(query.userId, 10);
    const user = store.getUserById(userId);

    if (!user) {
      set.status = 404;
      return { error: "User not found" };
    }

    const currentOrder = store.getCurrentOrderByUserId(userId);
    return { data: currentOrder ? toOrderResponse(currentOrder) : null };
  },
  {
    query: t.Object({
      userId: t.String({ pattern: "^[0-9]+$" }),
    }),
    response: {
      200: nullableOrderResponseEnvelopeSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 取得使用者歷史訂單
app.get(
  "/api/orders/history",
  ({ query, set }) => {
    const userId = parseInt(query.userId, 10);
    const user = store.getUserById(userId);

    if (!user) {
      set.status = 404;
      return { error: "User not found" };
    }

    return {
      data: store.getOrderHistoryByUserId(userId).map(toOrderResponse),
    };
  },
  {
    query: t.Object({
      userId: t.String({ pattern: "^[0-9]+$" }),
    }),
    response: {
      200: orderListResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 創建新訂單
app.post(
  "/api/orders",
  async ({ body, set }) => {
    const user = store.getUserById(body.userId);
    if (!user) {
      set.status = 404;
      return { error: "User not found" };
    }

    const existingOrder = store.getCurrentOrderByUserId(body.userId);
    if (existingOrder) {
      return { data: toOrderResponse(existingOrder) };
    }

    const newOrder = await store.createOrder({ userId: body.userId });
    set.status = 201;
    return { data: toOrderResponse(newOrder) };
  },
  {
    body: t.Object({
      userId: t.Number({ minimum: 1 }),
    }),
    response: {
      200: orderResponseEnvelopeSchema,
      201: orderResponseEnvelopeSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 獲取單筆訂單
app.get(
  "/api/orders/:id",
  ({ params, query, set }) => {
    const orderId = parseInt(params.id, 10);
    const userId = parseInt(query.userId, 10);
    const order = store.getOrderById(orderId);

    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }

    if (order.userId !== userId) {
      set.status = 403;
      return { error: "Forbidden" };
    }

    return { data: toOrderResponse(order) };
  },
  {
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
    query: t.Object({
      userId: t.String({ pattern: "^[0-9]+$" }),
    }),
    response: {
      200: orderResponseEnvelopeSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
    },
  },
);

// 更新訂單項目
app.patch(
  "/api/orders/:id",
  async ({ params, body, set }) => {
    const orderId = parseInt(params.id);
    const result = await store.updateOrderItem(orderId, {
      userId: body.userId,
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
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
    body: t.Object({
      userId: t.Number({ minimum: 1 }),
      itemId: t.Number({ minimum: 1 }),
      qty: t.Number({ minimum: 0 }),
    }),
    response: {
      200: orderResponseEnvelopeSchema,
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
  async ({ params, body, set }) => {
    const orderId = parseInt(params.id, 10);
    const result = await store.submitOrder(orderId, { userId: body.userId });

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

    if (!result.ok) {
      set.status = 500;
      return { error: "Unexpected store state" };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
    body: t.Object({
      userId: t.Number({ minimum: 1 }),
    }),
    response: {
      200: orderResponseEnvelopeSchema,
      400: apiErrorResponseSchema,
      403: apiErrorResponseSchema,
      404: apiErrorResponseSchema,
      409: apiErrorResponseSchema,
      500: apiErrorResponseSchema,
    },
  },
);

// 健康檢查路由
app.get("/health", () => ({ status: "ok" }), {
  response: {
    200: healthResponseSchema,
  },
});

// SPA fallback，未命中 API 或靜態資產時回傳前端入口。
app.get("*", async ({ request }) => {
  const pathname = new URL(request.url).pathname;
  const staticFile = Bun.file(`./public${pathname}`);

  if (pathname !== "/" && (await staticFile.exists())) {
    return staticFile;
  }

  return Bun.file("./public/index.html");
});

// 全局錯誤處理
app.onError(({ error, set, code }) => {
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
});
