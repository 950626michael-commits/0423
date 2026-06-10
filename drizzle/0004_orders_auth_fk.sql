DELETE FROM "bf_v9"."order_items"
WHERE "order_id" IN (
  SELECT "id"
  FROM "bf_v9"."orders"
  WHERE NOT EXISTS (
    SELECT 1
    FROM "bf_v9"."user"
    WHERE "bf_v9"."user"."id" = "bf_v9"."orders"."user_id"
  )
);
--> statement-breakpoint
DELETE FROM "bf_v9"."orders"
WHERE NOT EXISTS (
  SELECT 1
  FROM "bf_v9"."user"
  WHERE "bf_v9"."user"."id" = "bf_v9"."orders"."user_id"
);
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."orders" DROP CONSTRAINT IF EXISTS "orders_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."orders" DROP CONSTRAINT IF EXISTS "orders_user_id_user_id_fk";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_user_id_user_id_fk'
  ) THEN
    ALTER TABLE "bf_v9"."orders"
      ADD CONSTRAINT "orders_user_id_user_id_fk"
      FOREIGN KEY ("user_id")
      REFERENCES "bf_v9"."user"("id")
      ON DELETE no action
      ON UPDATE no action;
  END IF;
END $$;
