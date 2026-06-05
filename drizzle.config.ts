import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// 💡 強迫 Drizzle Kit 讀取專案根目錄的 .env 檔案
dotenv.config();

const migrationUrl = process.env.DATABASE_URL_MIGRATION || process.env.DATABASE_URL;

console.log("======== Drizzle Kit 連線檢查 ========");
console.log("當前要推入的 Schema 空間 (PG_SCHEMA):", process.env.PG_SCHEMA || "bf_v10");
console.log("連線字串是否取得:", migrationUrl ? "✅ 已取得" : "❌ 未取得");
console.log("====================================");

if (!migrationUrl) {
  throw new Error(
    "DATABASE_URL_MIGRATION or DATABASE_URL is required for drizzle-kit.",
  );
}

export default defineConfig({
  schema: ["./db/schema.ts", "./db/auth-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: migrationUrl,
  },
});