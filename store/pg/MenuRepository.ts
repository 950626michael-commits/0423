import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db/client.ts";
import { menuItemsTable } from "../../db/schema.ts";
import type { MenuItem, MenuItemVersionHistory } from "../../shared/contracts.ts";

type MenuRow = typeof menuItemsTable.$inferSelect;

async function getNextMenuItemId(): Promise<number> {
  const [row] = await db
    .select({
      nextId: sql<number>`coalesce(max((${menuItemsTable.id})::integer), 0) + 1`,
    })
    .from(menuItemsTable);

  return Number(row?.nextId ?? 1);
}

function toIso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toMenuItem(row: MenuRow, previousPrice?: number): MenuItem {
  const createdAt = toIso(row.createdAt);
  const updatedAt = toIso(row.updatedAt);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const createdMs = createdAt ? new Date(createdAt).getTime() : 0;

  return {
    id: row.id,
    logicalId: row.logicalId ?? String(row.id),
    version: row.version,
    name: row.name,
    price: row.price,
    category: row.category,
    description: row.description,
    image_url: row.imageUrl,
    isCurrentVersion: row.isCurrentVersion,
    isRecentlyUpdated: row.version > 1 && createdMs >= sevenDaysAgo,
    priceChanged:
      typeof previousPrice === "number" && previousPrice !== row.price,
    previousPrice:
      typeof previousPrice === "number" && previousPrice !== row.price
        ? previousPrice
        : undefined,
    supersedes: row.supersedes ?? undefined,
    changeReason: row.changeReason,
    createdAt,
    updatedAt,
  };
}

export class MenuRepository {
  async getCurrentMenu(): Promise<MenuItem[]> {
    const rows = await db
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.isCurrentVersion, true))
      .orderBy(asc(menuItemsTable.id));

    const previousRows = rows.length
      ? await db
          .select({ id: menuItemsTable.id, price: menuItemsTable.price })
          .from(menuItemsTable)
          .where(
            inArray(
              menuItemsTable.id,
              rows
                .map((row) => row.supersedes)
                .filter((id): id is number => typeof id === "number"),
            ),
          )
      : [];

    const previousPriceById = new Map(
      previousRows.map((row) => [row.id, row.price]),
    );

    return rows.map((row) =>
      toMenuItem(
        row,
        row.supersedes ? previousPriceById.get(row.supersedes) : undefined,
      ),
    );
  }

  async createMenuItem(input: {
    name: string;
    price: number;
    category: string;
    description: string;
    image_url: string;
    userId?: string;
  }): Promise<MenuItem> {
    const id = await getNextMenuItemId();
    const [inserted] = await db
      .insert(menuItemsTable)
      .values({
        id,
        logicalId: String(id),
        name: input.name,
        price: input.price,
        category: input.category,
        description: input.description,
        imageUrl: input.image_url,
        version: 1,
        isCurrentVersion: true,
        changeReason: "Initial creation",
        createdBy: input.userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!inserted) throw new Error("Failed to create menu item");

    return toMenuItem(inserted);
  }

  async updateMenuItem(
    menuId: number,
    patch: {
      name?: string;
      price?: number;
      category?: string;
      description?: string;
      image_url?: string;
      changeReason?: string;
    },
    userId?: string,
  ): Promise<MenuItem | null> {
    const [target] = await db
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.id, menuId))
      .limit(1);

    if (!target) return null;

    const logicalId = target.logicalId ?? String(target.id);
    let [current] = await db
      .select()
      .from(menuItemsTable)
      .where(
        and(
          eq(menuItemsTable.logicalId, logicalId),
          eq(menuItemsTable.isCurrentVersion, true),
        ),
      )
      .limit(1);

    if (!current) {
      [current] = await db
        .select()
        .from(menuItemsTable)
        .where(eq(menuItemsTable.logicalId, logicalId))
        .orderBy(desc(menuItemsTable.version), desc(menuItemsTable.id))
        .limit(1);
    }

    if (!current) return null;

    const nextId = await getNextMenuItemId();
    const [inserted] = await db
      .insert(menuItemsTable)
      .values({
        id: nextId,
        logicalId,
        version: current.version + 1,
        name: patch.name ?? current.name,
        price: patch.price ?? current.price,
        category: patch.category ?? current.category,
        description: patch.description ?? current.description,
        imageUrl: patch.image_url ?? current.imageUrl,
        isCurrentVersion: true,
        supersedes: current.id,
        changeReason: patch.changeReason ?? "Menu item updated",
        createdBy: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (!inserted) return null;

    await db
      .update(menuItemsTable)
      .set({ isCurrentVersion: false, updatedAt: new Date() })
      .where(
        and(
          eq(menuItemsTable.logicalId, logicalId),
          sql`${menuItemsTable.id} <> ${inserted.id}`,
        ),
      );

    return toMenuItem(inserted, current.price);
  }

  async hideCurrentMenuItem(menuId: number): Promise<MenuItem | null> {
    const [current] = await db
      .update(menuItemsTable)
      .set({ isCurrentVersion: false, updatedAt: new Date() })
      .where(
        and(
          eq(menuItemsTable.id, menuId),
          eq(menuItemsTable.isCurrentVersion, true),
        ),
      )
      .returning();

    return current ? toMenuItem(current) : null;
  }

  async getVersionHistory(menuId: number): Promise<MenuItemVersionHistory[]> {
    const [target] = await db
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.id, menuId))
      .limit(1);

    if (!target) return [];

    const logicalId = target.logicalId ?? String(target.id);
    const rows = await db
      .select()
      .from(menuItemsTable)
      .where(eq(menuItemsTable.logicalId, logicalId))
      .orderBy(desc(menuItemsTable.version));

    return rows.map((row) => ({
      ...toMenuItem(row),
      logicalId: row.logicalId ?? String(row.id),
      version: row.version,
      isCurrentVersion: row.isCurrentVersion,
      changeReason: row.changeReason,
      createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
    }));
  }

  async validateMenuItemsAreCurrent(menuItemIds: number[]) {
    if (menuItemIds.length === 0) {
      return { valid: true, outdatedIds: [] as number[] };
    }

    const rows = await db
      .select({
        id: menuItemsTable.id,
        isCurrentVersion: menuItemsTable.isCurrentVersion,
      })
      .from(menuItemsTable)
      .where(inArray(menuItemsTable.id, menuItemIds));

    const currentById = new Map(rows.map((row) => [row.id, row.isCurrentVersion]));
    const outdatedIds = menuItemIds.filter((id) => currentById.get(id) !== true);

    return {
      valid: outdatedIds.length === 0,
      outdatedIds,
    };
  }
}

export const menuRepository = new MenuRepository();
