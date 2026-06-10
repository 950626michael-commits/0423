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
      AND conrelid = '"bf_v9"."orders"'::regclass
  ) THEN
    ALTER TABLE "bf_v9"."orders"
      ADD CONSTRAINT "orders_user_id_user_id_fk"
      FOREIGN KEY ("user_id")
      REFERENCES "bf_v9"."user"("id")
      ON DELETE no action
      ON UPDATE no action;
  END IF;
END $$;
