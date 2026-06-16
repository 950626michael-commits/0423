WITH latest_versions AS (
  SELECT DISTINCT ON ("logical_id")
    "id",
    "logical_id"
  FROM "bf_v9"."menu_items"
  WHERE "logical_id" IS NOT NULL
  ORDER BY "logical_id", "version" DESC, "id" DESC
),
missing_current AS (
  SELECT latest_versions."id"
  FROM latest_versions
  WHERE NOT EXISTS (
    SELECT 1
    FROM "bf_v9"."menu_items" current_rows
    WHERE current_rows."logical_id" = latest_versions."logical_id"
      AND current_rows."is_current_version" = true
  )
)
UPDATE "bf_v9"."menu_items"
SET "is_current_version" = true,
    "updated_at" = now()
WHERE "id" IN (SELECT "id" FROM missing_current);
