ALTER TABLE IF EXISTS "bf_v9"."role_requests"
  ADD COLUMN IF NOT EXISTS "requested_role" text;
--> statement-breakpoint
UPDATE "bf_v9"."role_requests"
SET "requested_role" = "role"
WHERE "requested_role" IS NULL
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'bf_v9'
      AND table_name = 'role_requests'
      AND column_name = 'role'
  );
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."role_requests"
  ADD COLUMN IF NOT EXISTS "reason" text;
--> statement-breakpoint
UPDATE "bf_v9"."role_requests"
SET "reason" = 'Role upgrade requested from the app.'
WHERE "reason" IS NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."role_requests"
  ADD COLUMN IF NOT EXISTS "requested_at" timestamp with time zone DEFAULT now();
--> statement-breakpoint
UPDATE "bf_v9"."role_requests"
SET "requested_at" = "created_at"
WHERE "requested_at" IS NULL
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'bf_v9'
      AND table_name = 'role_requests'
      AND column_name = 'created_at'
  );
--> statement-breakpoint
UPDATE "bf_v9"."role_requests"
SET "requested_at" = now()
WHERE "requested_at" IS NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."role_requests"
  ADD COLUMN IF NOT EXISTS "reviewed_by" text;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."role_requests"
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."role_requests"
  ADD COLUMN IF NOT EXISTS "review_note" text;
--> statement-breakpoint
UPDATE "bf_v9"."role_requests"
SET "requested_role" = 'staff'
WHERE "requested_role" IS NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."role_requests"
  ALTER COLUMN "requested_role" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."role_requests"
  ALTER COLUMN "reason" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."role_requests"
  ALTER COLUMN "requested_at" SET NOT NULL;
