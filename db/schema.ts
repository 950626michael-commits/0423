import {
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  index,
  boolean,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema.ts";

// PostgreSQL namespace 隔離，配合講義切換至 bf_v10
const schemaName = process.env.PG_SCHEMA || "bf_v10";
if (schemaName === "public") {
  throw new Error(
    'PG_SCHEMA cannot be "public". Use a custom schema name or leave it unset to use the default "bf_v10".',
  );
}
const appSchema = pgSchema(schemaName);

// ==========================================
// 📋 菜單項目表 (方案 A：業務層版本化)
// ==========================================
export const menuItemsTable = appSchema.table(
  "menu_items",
  {
    id: text("id").primaryKey(), // 複合主鍵，格式如 "001-01"
    entityId: text("entity_id").notNull(), // UUID 實體識別
    logicalId: text("logical_id").notNull(), // 業務邏輯編號如 "001"
    version: integer("version").notNull().default(1),

    name: text("name").notNull(),
    price: integer("price").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    imageUrl: text("image_url").notNull(),

    isCurrentVersion: boolean("is_current_version").default(true),
    supersedes: text("supersedes").references(
      (): AnyPgColumn => menuItemsTable.id,
    ),
    changeReason: text("change_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
  },
  (table) => ({
    entityVersionIdx: uniqueIndex("menu_items_entity_version_idx").on(
      table.entityId,
      table.version,
    ),
    logicalIdIdx: index("menu_items_logical_id_idx").on(table.logicalId),
    
    // 💡 改成這樣，紅字就會立刻消失了！
    currentVersionIdx: index("menu_items_current_version_idx")
      .on(table.isCurrentVersion)
      .where(sql`is_current_version = true`),
  })
);

// ==========================================
// 📋 訂單主表
// ==========================================
export const ordersTable = appSchema.table("orders", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  total: integer("total").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
});

// ==========================================
// 📋 訂單項目表 (方案 A：簡化欄位，指向特定版本 id)
// ==========================================
export const orderItemsTable = appSchema.table(
  "order_items",
  {
    id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    // 配合方案 A，改為 TEXT 型態，直接映射到帶有版本號的 menu_items.id
    menuItemId: text("menu_item_id")
      .notNull()
      .references(() => menuItemsTable.id),
    qty: integer("qty").notNull(),
  },
  (table) => ({
    orderItemUniqueIdx: uniqueIndex("order_items_order_item_idx").on(
      table.orderId,
      table.menuItemId,
    ),
  }),
);

// ==========================================
// 📋 角色審核申請表
// ==========================================
export const roleRequestsTable = appSchema.table("role_requests", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  requestedRole: text("requested_role").notNull(),
  reason: text("reason").notNull(),
  status: text("status").notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  reviewedBy: text("reviewed_by").references(() => user.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNote: text("review_note"),
});