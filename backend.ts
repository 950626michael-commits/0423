// backend.ts - 修正 ID 型別處理版

import { Elysia } from "elysia";
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
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

const port = parseInt(process.env.PORT || "3000", 10);
const host = process.env.HOST || "localhost";
const allowedOrigin = process.env.API_ALLOWED_ORIGIN || "http://localhost:5173";
const store = createStore({ dataFilePath: "./data/store.json" });
const hasPublicAssets = existsSync("./public") && existsSync("./public/index.html");

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

async function requireAnyRole(request: Request, allowedRoles: Role[]) {
  const user = await requireUser(request);
  const userRoles = user.roles || ["customer"];
  const hasPermission = userRoles.some((role) => allowedRoles.includes(role as Role));
  if (!hasPermission) {
    throw new Response(JSON.stringify({ error: "Forbidden", message: "權限不足" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}
export type Role = "customer" | "staff" | "chef" | "owner" | "admin";
const app = new Elysia();

app.use(cors({ origin: allowedOrigin, credentials: true, methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.get("/api/auth/*", ({ request }) => auth.handler(request));
app.post("/api/auth/*", ({ request }) => auth.handler(request));

app.use(openapi({ path: "/openapi", specPath: "/openapi/json", documentation: { info: { title: "Breakfast Master API", version: "1.0.0" } } }));

app.onRequest(({ request }) => { console.log(`[${toTaipeiDateTime(new Date().toISOString())}] ${request.method} ${new URL(request.url).pathname}`); });

// ─── 菜單路由區 ───
app.get("/api/menu", () => ({ data: [...store.getMenu()] }));

app.patch("/api/menu/:id", async ({ params: { id }, body, request, set }) => {
  await requireAnyRole(request, ["admin", "owner"]);
  const updateData = body as { 
    name?: string; 
    price?: number; 
    category?: string; 
    description?: string; 
    image_url?: string; 
  };
  const menuItem = await store.updateMenuItem(id, updateData); // 直接傳字串 id
  if (!menuItem) { set.status = 404; return { error: "Menu item not found" }; }
  return { data: menuItem };
});

app.delete("/api/menu/:id", async ({ params, request, set }) => {
  await requireAnyRole(request, ["admin", "owner"]);
  const removed = await store.deleteMenuItem(params.id); // 直接傳字串 id
  if (!removed) { set.status = 404; return { error: "Menu item not found" }; }
  return { data: removed };
});

// ─── 訂單路由區 ───
app.get("/api/orders", async ({ request }) => {
  const user = await requireUser(request);
  const userRoles = user.roles || ["customer"];
  const isStaff = userRoles.some((r) => ["admin", "owner", "chef", "staff"].includes(r));
  return { data: (isStaff ? store.getOrders() : store.getOrderHistoryByUserId(user.id)).map(toOrderResponse) };
});

app.get("/api/orders/:id", async ({ params, request, set }) => {
  const user = await requireUser(request);
  const order = store.getOrderById(params.id); // 直接傳字串 id
  if (!order) { set.status = 404; return { error: "Order not found" }; }
  
  const isStaff = (user.roles || ["customer"]).some((r) => ["admin", "owner", "chef", "staff"].includes(r));
  if (order.userId !== user.id && !isStaff) { set.status = 403; return { error: "Forbidden" }; }
  return { data: toOrderResponse(order) };
});

app.patch("/api/orders/:id", async ({ params, body, request, set }) => {
  const user = await requireUser(request);
  
  // 💡 解決方式：定義一個介面來描述 body，並將其強制轉型
  const { itemId, qty } = body as { itemId: string | number; qty: number };

  const result = await store.updateOrderItem(params.id, { 
    userId: user.id, 
    itemId: String(itemId), // 現在 TypeScript 知道 itemId 存在了
    qty: qty 
  });
  
  if (!result.ok) { 
    set.status = 500; 
    return { error: "Update failed" }; 
  }
  
  return { data: toOrderResponse(result.order) };
});

app.post("/api/orders/:id/submit", async ({ params, request, set }) => {
  const user = await requireUser(request);
  const result = await store.submitOrder(params.id, { userId: user.id }); // 直接傳字串 id
  if (!result.ok) { set.status = 500; return { error: "Submit failed" }; }
  return { data: toOrderResponse(result.order) };
});

// 啟動
await store.init();
app.listen(port, () => console.log(`🍳 API 運行在 http://${host}:${port}`));