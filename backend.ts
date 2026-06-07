// backend.ts - 修正 ID 型別處理與靜態網頁掛載版

import { Elysia } from "elysia";
import { staticPlugin } from '@elysiajs/static'; 
import { openapi } from "@elysiajs/openapi";
import { cors } from "@elysiajs/cors";
import { existsSync } from "node:fs";
import { join } from "node:path"; // 👈 1. 引入 join 處理絕對路徑
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

// === 🔍 偵錯專用特務 Log 開始 ===
import fs from 'node:fs';
const checkPath = join(process.cwd(), "data/store.json");
console.log("===== 🚨 專案根目錄 (cwd) 實際路徑 =====", process.cwd());
console.log("===== 🚨 預計讀取的 JSON 絕對路徑 =====", checkPath);
console.log("===== 🚨 請問這個檔案真的存在嗎？ =====", fs.existsSync(checkPath));
// === 🔍 偵錯專用特務 Log 結束 ===
// 請確保改成這行 👇
const store = createStore({ dataFilePath: join(process.cwd(), "data/store.json") });

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
app.onError(({ code, error, request }) => {
    console.error(`🚨 [Backend Error] 路由: ${request.method} ${request.url}`);
    console.error(`🚨 錯誤代碼: ${code}`);
    console.error(`🚨 錯誤詳細內容:`, error);
    
    // 👇 用 instanceof 確保安全讀取 message，如果不是 Error 物件就轉成字串
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: errorMessage || 'Internal Server Error'
    };
});
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
  const menuItem = await store.updateMenuItem(id, updateData); 
  if (!menuItem) { set.status = 404; return { error: "Menu item not found" }; }
  return { data: menuItem };
});

app.delete("/api/menu/:id", async ({ params, request, set }) => {
  await requireAnyRole(request, ["admin", "owner"]);
  const removed = await store.deleteMenuItem(params.id); 
  if (!removed) { set.status = 404; return { error: "Menu item not found" }; }
  return { data: removed };
});


// ─── 訂單路由區 ───
// 1. 補上前端要的 current (取得目前處理中的訂單/購物車)
app.get("/api/orders/current", async ({ request, set }) => {
  const user = await requireUser(request);
  // 檢查你的 store 有沒有取得當前訂單的方法，這裡假設是 getOrders 或特定過濾
  // 如果你的架構設計是用 /api/orders 就能自動分流，這裡也可以直接調用你原本的邏輯：
  const userRoles = user.roles || ["customer"];
  const isStaff = userRoles.some((r) => ["admin", "owner", "chef", "staff"].includes(r));
  
  // 這裡先暫時返回跟 /api/orders 一樣的防禦資料，讓前端不噴黃字
  return { data: (isStaff ? store.getOrders() : store.getOrderHistoryByUserId(user.id)).map(toOrderResponse) };
});

// 2. 補上前端要的 history (取得歷史訂單)
app.get("/api/orders/history", async ({ request }) => {
  const user = await requireUser(request);
  // 這裡專門撈該使用者的歷史紀錄
  return { data: store.getOrderHistoryByUserId(user.id).map(toOrderResponse) };
});

app.get("/api/orders", async ({ request }) => {
  const user = await requireUser(request);
  const userRoles = user.roles || ["customer"];
  const isStaff = userRoles.some((r) => ["admin", "owner", "chef", "staff"].includes(r));
  return { data: (isStaff ? store.getOrders() : store.getOrderHistoryByUserId(user.id)).map(toOrderResponse) };
});

app.get("/api/orders/:id", async ({ params, request, set }) => {
  const user = await requireUser(request);
  const order = store.getOrderById(params.id); 
  if (!order) { set.status = 404; return { error: "Order not found" }; }
  
  const isStaff = (user.roles || ["customer"]).some((r) => ["admin", "owner", "chef", "staff"].includes(r));
  if (order.userId !== user.id && !isStaff) { set.status = 403; return { error: "Forbidden" }; }
  return { data: toOrderResponse(order) };
});

app.patch("/api/orders/:id", async ({ params, body, request, set }) => {
  const user = await requireUser(request);
  const { itemId, qty } = body as { itemId: string | number; qty: number };

  const result = await store.updateOrderItem(params.id, { 
    userId: user.id, 
    itemId: String(itemId), 
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
  const result = await store.submitOrder(params.id, { userId: user.id }); 
  if (!result.ok) { set.status = 500; return { error: "Submit failed" }; }
  return { data: toOrderResponse(result.order) };
});

// ─── 2. 靜態網頁與 SPA 路由區 (務必放在最下方) ───
const publicPath = join(process.cwd(), "public");

app.use(staticPlugin({
  assets: publicPath,
  prefix: '/'
}));

// 攔截所有非 API 請求，直接返回前端 index.html (解決前端 SPA 重新整理 404 的問題)
app.get("/*", ({ path, set }) => {
  if (!path.startsWith("/api") && !path.startsWith("/openapi")) {
    const indexPath = join(publicPath, "index.html");
    if (existsSync(indexPath)) {
      return Bun.file(indexPath);
    }
  }
  set.status = 404;
  return { error: "Not Found" };
});

// 啟動
await store.init();
app.listen(port, () => console.log(`🍳 API 運行在 http://${host}:${port}`));