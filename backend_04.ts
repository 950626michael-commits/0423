import { Elysia, t } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import toTaipeiDateTime from "./util.ts";
import type { Order, OrderResponse } from "./shared/contracts_02.ts";
import { createStore } from "./store/index_04.ts";

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

// 菜單路由
app.get("/api/menu", () => ({ data: store.getMenu() }));

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
  },
);

// 訂單列表路由
app.get("/api/orders", () => ({
  data: store.getOrders().map(toOrderResponse),
}));

// 創建新訂單
app.post(
  "/api/orders",
  async () => {
    const newOrder = await store.createOrder();
    return { data: toOrderResponse(newOrder) };
  },
  { response: { status: 201 } },
);

// 獲取單筆訂單
app.get("/api/orders/:id", ({ params, set }) => {
  const orderId = parseInt(params.id);
  const order = store.getOrderById(orderId);

  if (!order) {
    set.status = 404;
    return { error: "Order not found" };
  }
  return { data: toOrderResponse(order) };
});

// 更新訂單項目
app.patch(
  "/api/orders/:id",
  async ({ params, body, set }) => {
    const orderId = parseInt(params.id);
    const result = await store.updateOrderItem(orderId, {
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

    if (!result.ok) {
      set.status = 500;
      return { error: "Unexpected store state" };
    }

    return { data: toOrderResponse(result.order) };
  },
  {
    body: t.Object({
      itemId: t.Number({ minimum: 1 }),
      qty: t.Number({ minimum: 0 }),
    }),
  },
);

// 健康檢查路由
app.get("/health", () => ({ status: "ok" }));

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
