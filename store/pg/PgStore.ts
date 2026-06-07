import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { MenuItem, Order, OrderItem } from "../../shared/contracts.ts";
import { db } from "../../db/client.ts";
import { menuItemsTable, orderItemsTable, ordersTable } from "../../db/schema.ts";
import type { Store } from "../Store.ts";

export class PgStore implements Store {
  private menu: MenuItem[] = [];
  private orders: Order[] = [];

  async init(): Promise<void> {
    await db.execute(sql`select 1`);
    await this.reloadFromDatabase();
  }

  getMenu(): ReadonlyArray<MenuItem> {
    return this.menu;
  }

  async createMenuItem(input: { name: string; price: number; category: string; description: string; image_url: string }): Promise<MenuItem> {
    // 💡 修正點 1：因為 id 改成 text 且不再自動遞增，我們手動生成一個唯一字串 ID
    const generatedId = crypto.randomUUID(); 

    const [inserted] = await db.insert(menuItemsTable).values({
      id: generatedId, // 👈 補上這行必填的 id，values 的紅字立刻消失！
      name: input.name, 
      price: input.price, 
      category: input.category, 
      description: input.description, 
      imageUrl: input.image_url
    }).returning();
    
    if (!inserted) throw new Error("Failed to insert");

    // 💡 修正點 2：inserted.id 已經是字串，直接使用即可，不需要再包 String()
    const created: MenuItem = { ...input, id: inserted.id };
    this.menu.push(created);
    return created;
  }

  async updateMenuItem(menuId: string, patch: any): Promise<MenuItem | null> {
    // 💡 安全處理：複製一份 patch，並將前端的 image_url 轉成資料庫認識的 imageUrl
    // 同時刪除 image_url 欄位，避免 Drizzle 因為看不懂該欄位而噴錯
    const updateData = { ...patch };
    if ('image_url' in updateData) {
      updateData.imageUrl = updateData.image_url;
      delete updateData.image_url;
    }

    const [updated] = await db.update(menuItemsTable)
      .set(updateData)
      // 💡 修正點 1：拿掉 Number()，因為 id 已經是字串，直接拿 menuId 比對
      .where(eq(menuItemsTable.id, menuId)) 
      .returning();
      
    if (!updated) return null;
    
    // 💡 修正點 2：updated.id 本身就是字串了，直接拿掉 String() 的包裝
    const next: MenuItem = { 
      id: updated.id, 
      name: updated.name, 
      price: updated.price, 
      category: updated.category, 
      description: updated.description, 
      image_url: updated.imageUrl 
    };
    
    const idx = this.menu.findIndex((item) => item.id === menuId);
    if (idx !== -1) this.menu[idx] = next;
    return next;
  }

  async deleteMenuItem(menuId: string): Promise<MenuItem | null> {
    // 💡 修正點 3：把原本的 Number(menuId) 刪掉，直接帶入 menuId 字串，eq 的紅字立刻消失！
    const [removed] = await db.delete(menuItemsTable).where(eq(menuItemsTable.id, menuId)).returning();
    if (!removed) return null;
    this.menu = this.menu.filter(item => item.id !== menuId);
    
    // 💡 修正點 4：removed.id 已經是字串，直接拿來用即可
    return { ...removed, id: removed.id, image_url: removed.imageUrl };
  }

  getOrders(): ReadonlyArray<Order> { return this.orders; }

  getCurrentOrderByUserId(userId: string): Order | undefined {
    return this.orders.find(o => o.userId === userId && o.status === "pending");
  }

  getOrderHistoryByUserId(userId: string): ReadonlyArray<Order> {
    return this.orders.filter(o => o.userId === userId && o.status === "submitted");
  }

  getOrderById(orderId: string): Order | undefined {
    return this.orders.find(o => o.id === orderId);
  }

  async createOrder(input: { userId: string }): Promise<Order> {
    const existing = this.getCurrentOrderByUserId(input.userId);
    if (existing) return existing;

    // 1. 執行插入
    const [inserted] = await db
      .insert(ordersTable)
      .values({ 
        userId: input.userId, 
        status: "pending", 
        total: 0, 
        createdAt: new Date() 
      })
      .returning();

    // 2. 這裡就是你要補上的「守護檢查」
    // 如果資料庫插入失敗，inserted 會是 undefined，這行會拋出錯誤，TypeScript 就知道後面一定是成功的
    if (!inserted) {
      throw new Error("Failed to create order in database");
    }

    // 3. 這裡的 inserted 現在對 TypeScript 來說是「絕對存在」的
    const newOrder: Order = { 
      id: String(inserted.id), 
      userId: input.userId, 
      items: [], 
      total: 0, 
      status: "pending", 
      createdAt: new Date().toISOString() 
    };
    
    this.orders.push(newOrder);
    return newOrder;
  }

  async updateOrderItem(orderId: string, input: { userId: string; itemId: string; qty: number }): Promise<any> {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    // 後續邏輯保持一致，但在比較 itemId 時請確保都轉為 string
    return { ok: true, order };
  }

  async submitOrder(orderId: string, input: { userId: string }): Promise<any> {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return { ok: false, code: "ORDER_NOT_FOUND" };
    await db.update(ordersTable).set({ status: "submitted" }).where(eq(ordersTable.id, Number(orderId)));
    order.status = "submitted";
    return { ok: true, order };
  }

  private async reloadFromDatabase(): Promise<void> {
    // 這裡從 DB 讀取資料時，記得用 String() 將 row.id 轉為字串
    // this.menu = rows.map(r => ({ ...r, id: String(r.id) }));
  }
}