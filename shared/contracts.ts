import { z } from "zod";

// ─── API Business Schemas（Single Source of Truth）──────────────────────────
// 這裡是前後端共用的業務型別定義。
// 型別（TypeScript type）由 Zod schema 自動推導，不需要手動維護兩份。

// 💡 V10 守護原則：維持 id 為 z.number()，確保前端購物車、點餐完全不壞！
export const menuItemSchema = z.object({
  id: z.number().int().min(1),
  name: z.string().min(1),
  price: z.number().min(0),
  category: z.string().min(1),
  description: z.string(),
  image_url: z.string().min(1),
});

// 💡 V10 規格：定義 RBAC 系統的五大核心角色
export const roleSchema = z.enum(["customer", "staff", "chef", "owner", "admin"]);
export type Role = z.infer<typeof roleSchema>;

// ─── User schemas（業務層）──────────────────────────────────────────────────
// userSchema：完整使用者資料（業務/資料層使用，不對外暴露）
// sessionUserSchema：API 回傳的最小安全投影（不含 password 等敏感欄位）

export const userSchema = z.object({
  id: z.string().min(1),
  email: z.string().min(3),
  name: z.string().min(1),
  password: z.string().min(1),
  // 💡 V10 規格：使用者支援多重角色，預設為 ["customer"]
  roles: z.array(roleSchema).min(1).default(["customer"]),
  // 預留個資欄位
  birthday: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
});

// 💡 V10 規格：sessionUserSchema 必須包含 roles，前端才能判斷要顯示哪些按鈕
export const sessionUserSchema = userSchema.pick({
  id: true,
  email: true,
  name: true,
  roles: true, // 👈 關鍵：把角色放進 Session 投影中
});

// ─── Role Request Schemas（V10 權限申請異動契約）───────────────────────────
export const roleRequestStatusSchema = z.enum(["pending", "approved", "rejected"]);

export const roleRequestSchema = z.object({
  id: z.number().int().min(1),
  userId: z.string().min(1),
  requestedRole: roleSchema.extract(["staff", "chef"]), // 只能申請店員或廚師
  reason: z.string().min(10), // 申請理由至少 10 字
  status: roleRequestStatusSchema,
  requestedAt: z.string().min(1),
  reviewedBy: z.string().min(1).nullable().optional(),
  reviewedAt: z.string().min(1).nullable().optional(),
  reviewNote: z.string().nullable().optional(),
});

// ─── Order Schemas（V10 不可變快照設計）─────────────────────────────────────
// 💡 講義黃金考點：orderItemSchema 裡面的 item 完美繼承了 menuItemSchema，
// 這代表點餐當下的完整食物快照（名稱、當下價格、圖片）會跟著訂單一起儲存！
export const orderItemSchema = z.object({
  item: menuItemSchema,
  qty: z.number().min(0),
});

export const orderSchema = z.object({
  id: z.number().int().min(1),
  userId: z.string().min(1),
  items: z.array(orderItemSchema),
  total: z.number().min(0),
  status: z.enum(["pending", "submitted"]),
  createdAt: z.string().min(1),
  submittedAt: z.string().min(1).optional(),
});

// ─── Derived TypeScript Types（自動推導，永不過時）───────────────────────────
export type MenuItem = z.infer<typeof menuItemSchema>;
export type User = z.infer<typeof userSchema>;
export type SessionUser = z.infer<typeof sessionUserSchema>;
export type RoleRequest = z.infer<typeof roleRequestSchema>;
export type RoleRequestStatus = z.infer<typeof roleRequestStatusSchema>;
export type OrderItem = z.infer<typeof orderItemSchema>;
export type Order = z.infer<typeof orderSchema>;

export interface ApiDataResponse<T> {
  data: T;
}