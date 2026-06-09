#!/usr/bin/env bun
/**
 * 資料庫初始化腳本 - 清空所有測試數據
 *
 * 使用情境：系統準備正式上線前，清除所有測試數據
 *
 * 清空內容：
 * - ✅ 訂單數據（orders + order_items）
 * - ✅ 測試用戶（user + session + account + verification）
 *
 * 保留內容：
 * - ✅ 菜單數據（menu_items）
 *
 * 執行方式：bun run scripts/reset-database.ts
 */

import { db } from "../db/client.ts";
import { ordersTable, orderItemsTable } from "../db/schema.ts";
import { user, session, account, verification } from "../db/auth-schema.ts";

async function resetDatabase() {
  console.log("🚀 開始清理資料庫...\n");

  try {
    // 1. 清空訂單相關數據
    console.log("📦 清空訂單數據...");
    const deletedOrderItems = await db.delete(orderItemsTable);
    console.log(`   ✅ 已清空 order_items 資料表`);

    const deletedOrders = await db.delete(ordersTable);
    console.log(`   ✅ 已清空 orders 資料表`);

    // 2. 清空認證相關數據（按照外鍵順序）
    console.log("\n🔐 清空認證數據...");

    const deletedSessions = await db.delete(session);
    console.log(`   ✅ 已清空 session 資料表`);

    const deletedAccounts = await db.delete(account);
    console.log(`   ✅ 已清空 account 資料表`);

    const deletedVerifications = await db.delete(verification);
    console.log(`   ✅ 已清空 verification 資料表`);

    const deletedUsers = await db.delete(user);
    console.log(`   ✅ 已清空 user 資料表`);

    // 3. 保留菜單數據（不做任何操作）
    console.log("\n🍳 保留 menu_items 資料表（不清空）");

    console.log("\n✨ 資料庫初始化完成！");
    console.log("\n📋 摘要：");
    console.log("   - 所有訂單數據已清空");
    console.log("   - 所有測試用戶已清空");
    console.log("   - 菜單數據完整保留");
    console.log("\n💡 系統已準備好接受新用戶註冊與訂單。");
  } catch (error) {
    console.error("\n❌ 清理失敗：", error);
    process.exit(1);
  }

  process.exit(0);
}

resetDatabase();
