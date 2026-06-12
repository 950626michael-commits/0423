ALTER TABLE IF EXISTS "bf_v9"."menu_items"
  ADD COLUMN IF NOT EXISTS "logical_id" text;
--> statement-breakpoint
UPDATE "bf_v9"."menu_items"
SET "logical_id" = "id"::text
WHERE "logical_id" IS NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."menu_items"
  ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."menu_items"
  ADD COLUMN IF NOT EXISTS "is_current_version" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."menu_items"
  ADD COLUMN IF NOT EXISTS "supersedes" integer;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."menu_items"
  ADD COLUMN IF NOT EXISTS "change_reason" text DEFAULT 'Initial creation' NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."menu_items"
  ADD COLUMN IF NOT EXISTS "created_by" text;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."menu_items"
  ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE IF EXISTS "bf_v9"."menu_items"
  ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "bf_v9"."menu_items"
SET "logical_id" = "id"::text
WHERE "logical_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "menu_items_current_version_idx"
  ON "bf_v9"."menu_items" ("logical_id", "is_current_version");
