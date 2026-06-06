import {
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
// 💡 引入 sql 關鍵字，用來定義資料庫陣列的預設值
import { sql } from "drizzle-orm"; 

// PostgreSQL namespace 隔離
// 透過 PG_SCHEMA 環境變數切換，預設 "bf_v9"
const schemaName = process.env.PG_SCHEMA || "bf_v9";
if (schemaName === "public") {
  throw new Error(
    'PG_SCHEMA cannot be "public". Use a custom schema name or leave it unset to use the default "bf_v9".',
  );
}
const appSchema = pgSchema(schemaName);

// ─── 1. Better Auth 使用者資料表擴充（V10 RBAC 核心） ──────────────────────────
// 講義要求：使用者必須具備多重角色能力。
// 我們在這裡重新宣告與 auth-schema.ts 同名的 user 表，以便 Drizzle 識別並擴充 roles 欄位。
export const userTable = appSchema.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: integer("email_verified"),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  // 💡 V10 關鍵考點：加入 roles 欄位，型態為 text array，預設值為 ['customer']
  roles: text("roles")
    .array()
    .notNull()
    .default(sql`ARRAY['customer']::text[]`),
});

// ─── 2. 權限申請異動資料表（V10 RBAC 核心） ──────────────────────────────────
// 講義要求：店員與廚師的權限異動需要經過審核流程
export const roleRequestsTable = appSchema.table("role_requests", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: text("user_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  requestedRole: text("requested_role").notNull(), // "staff" | "chef"
  reason: text("reason").notNull(),                // 申請理由
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedBy: text("reviewed_by").references(() => userTable.id), // 審核者的 user.id
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),                 // 審核批註
});

// ─── 3. 菜單資料表（維持數字 ID 完美守護前端） ──────────────────────────────────
export const menuItemsTable = appSchema.table("menu_items", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull(),
  price: integer("price").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
});

// ─── 4. 訂單主表 ─────────────────────────────────────────────────────────────
export const ordersTable = appSchema.table("orders", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: text("user_id")
    .notNull()
    .references(() => userTable.id), // 💡 對齊擴充後的 userTable
  total: integer("total").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});

// ─── 5. 訂單項目明細表（不可變快照設計） ───────────────────────────────────────
export const orderItemsTable = appSchema.table(
  "order_items",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    itemId: integer("item_id").notNull(),
    name: text("name").notNull(),
    price: integer("price").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    imageUrl: text("image_url").notNull(),
    qty: integer("qty").notNull(),
  },
  (table) => ({
    orderItemUniqueIdx: uniqueIndex("order_items_order_item_idx").on(
      table.orderId,
      table.itemId,
    ),
  }),
);