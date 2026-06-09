ALTER TABLE IF EXISTS "bf_v9"."order_items"
  ALTER COLUMN "menu_item_id" DROP NOT NULL;
--> statement-breakpoint
UPDATE "bf_v9"."order_items"
SET "item_id" = NULLIF("menu_item_id", '')::integer
WHERE "item_id" IS NULL
  AND "menu_item_id" ~ '^[0-9]+$';
