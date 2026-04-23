import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleSqlite } from "drizzle-orm/bun-sqlite";
import { Database } from "bun:sqlite";
import * as schema from "./schema.ts";

const databaseUrl = process.env.DATABASE_URL;
const storeDriver = "json";

let db;

if (storeDriver === "json") {
  // 建立一個本地的 SQLite 資料庫檔案 (db.sqlite)
  const sqlite = new Database("db.sqlite");
  db = drizzleSqlite(sqlite, { schema });
  console.log(" usando Local SQLite (JSON mode)");
} else {
  // 原有的 PostgreSQL 邏輯
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for PostgreSQL store. Set DATABASE_URL or switch STORE_DRIVER=json.",
    );
  }
  const pool = new Pool({ connectionString: databaseUrl });
  db = drizzleNeon({ client: pool, schema });
  console.log(" usando PostgreSQL (Neon)");
}

export { db };