import { Elysia, t } from "elysia";
import { staticPlugin } from "@elysiajs/static";
import toTaipeiDateTime from "./util.ts";
import type {
  MenuItem,
  Order,
  OrderItem,
  OrderResponse,
} from "./shared/contracts_01.ts";

// 模擬數據
const menu: MenuItem[] = [
  { id: 1, name: "蛋餅", price: 30, category: "主食" },
  { id: 2, name: "鮮奶茶", price: 50, category: "飲料" },
  { id: 3, name: "蔥油餅", price: 25, category: "主食" },
  { id: 4, name: "豆漿", price: 20, category: "飲料" },
];
let menuIdCounter = menu.length;

const orders: Order[] = [];
let orderIdCounter = 0;

function toOrderResponse(order: Order): OrderResponse {
  return {
    ...order,
    createdAtTaipei: toTaipeiDateTime(order.createdAt),
  };
}

// 根據訂單內目前所有品項與數量，重新計算整張訂單的總金額。
function calculateOrderTotal(items: OrderItem[]): number {
  return items.reduce((sum, orderItem) => {
    return sum + orderItem.item.price * orderItem.qty;
  }, 0);
}

// 從環境變量獲取配置
const port = parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "localhost";
const allowedOrigin = process.env.API_ALLOWED_ORIGIN || "*";

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
app.get("/api/menu", () => ({ data: menu }));

app.post(
  "/api/menu",
  ({ body, set }) => {
    const newMenuItem: MenuItem = {
      id: ++menuIdCounter,
      name: body.name,
      price: body.price,
      category: body.category,
    };

    menu.push(newMenuItem);
    set.status = 201;
    return { data: newMenuItem };
  },
  {
    body: t.Object({
      name: t.String({ minLength: 1 }),
      price: t.Integer({ minimum: 0 }),
      category: t.String({ minLength: 1 }),
    }),
  },
);

app.patch(
  "/api/menu/:id",
  ({ params, body, set }) => {
    const menuId = parseInt(params.id);
    const menuItem = menu.find((m) => m.id === menuId);

    if (!menuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    menuItem.name = body.name ?? menuItem.name;
    menuItem.price = body.price ?? menuItem.price;
    menuItem.category = body.category ?? menuItem.category;

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
    }),
  },
);

app.delete(
  "/api/menu/:id",
  ({ params, set }) => {
    const menuId = parseInt(params.id);
    const menuItemIndex = menu.findIndex((m) => m.id === menuId);

    if (menuItemIndex === -1) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    const [removedMenuItem] = menu.splice(menuItemIndex, 1);
    return { data: removedMenuItem };
  },
  {
    params: t.Object({
      id: t.String({ pattern: "^[0-9]+$" }),
    }),
  },
);

// 訂單列表路由
app.get("/api/orders", () => ({ data: orders.map(toOrderResponse) }));

// 創建新訂單
app.post(
  "/api/orders",
  () => {
    const newOrder: Order = {
      id: ++orderIdCounter,
      items: [],
      total: 0,
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    orders.push(newOrder);
    return { data: toOrderResponse(newOrder) };
  },
  { response: { status: 201 } },
);

// 獲取單筆訂單
app.get("/api/orders/:id", ({ params, set }) => {
  const orderId = parseInt(params.id);
  const order = orders.find((o) => o.id === orderId);

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
    const order = orders.find((o) => o.id === orderId);

    if (!order) {
      set.status = 404;
      return { error: "Order not found" };
    }

    const { itemId, qty } = body;

    const menuItem = menu.find((m) => m.id === itemId);
    if (!menuItem) {
      set.status = 404;
      return { error: "Menu item not found" };
    }

    const existingItemIndex = order.items.findIndex(
      (orderItem) => orderItem.item.id === itemId,
    );

    if (existingItemIndex !== -1) {
      const existingOrderItem = order.items[existingItemIndex];

      if (!existingOrderItem) {
        set.status = 500;
        return { error: "Order item not found" };
      }

      if (qty === 0) {
        order.items.splice(existingItemIndex, 1);
      } else {
        existingOrderItem.qty = qty;
      }
    } else if (qty > 0) {
      order.items.push({ item: menuItem, qty });
    }

    order.total = calculateOrderTotal(order.items);

    return { data: toOrderResponse(order) };
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
app.get("*", () => Bun.file("./public/index.html"));

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
app.listen(port, () => {
  console.log(`🍳 早餐店 API 運行在 http://${host}:${port}`);
  console.log(`🌐 Web App: http://${host}:${port}`);
  console.log(`📋 菜單 API: http://${host}:${port}/api/menu`);
  console.log(`📦 訂單 API: http://${host}:${port}/api/orders`);
  console.log(`💚 健康檢查: http://${host}:${port}/health`);
  console.log(`🔐 CORS Origin: ${allowedOrigin}`);
});
