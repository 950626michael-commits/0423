DO $$
DECLARE
  roles_type text;
BEGIN
  SELECT udt_name
  INTO roles_type
  FROM information_schema.columns
  WHERE table_schema = 'bf_v9'
    AND table_name = 'user'
    AND column_name = 'roles';

  IF roles_type IS NULL THEN
    ALTER TABLE "bf_v9"."user"
      ADD COLUMN "roles" text[] DEFAULT ARRAY['customer']::text[] NOT NULL;
  ELSIF roles_type IN ('json', 'jsonb') THEN
    ALTER TABLE "bf_v9"."user"
      ADD COLUMN IF NOT EXISTS "roles_text_array" text[] DEFAULT ARRAY['customer']::text[] NOT NULL;

    UPDATE "bf_v9"."user"
    SET "roles_text_array" =
      CASE
        WHEN jsonb_typeof("roles"::jsonb) = 'array' THEN
          ARRAY(
            SELECT jsonb_array_elements_text("roles"::jsonb)
          )
        WHEN "role" IS NOT NULL AND "role" <> '' THEN
          ARRAY["role"]
        ELSE
          ARRAY['customer']::text[]
      END;

    ALTER TABLE "bf_v9"."user" DROP COLUMN "roles";
    ALTER TABLE "bf_v9"."user" RENAME COLUMN "roles_text_array" TO "roles";
  END IF;
END $$;
