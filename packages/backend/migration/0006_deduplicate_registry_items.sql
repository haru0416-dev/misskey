LOCK TABLE "registry_item" IN SHARE ROW EXCLUSIVE MODE;

WITH "ranked_registry_items" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "userId", "domain", "scope", "key"
			ORDER BY "updatedAt" DESC, "id" DESC
		) AS "row_number"
	FROM "registry_item"
)
DELETE FROM "registry_item"
USING "ranked_registry_items"
WHERE "registry_item"."id" = "ranked_registry_items"."id"
	AND "ranked_registry_items"."row_number" > 1;

CREATE UNIQUE INDEX "TMP_UQ_REGISTRY_ITEM_LOGICAL_KEY"
	ON "registry_item" ("userId", "domain", "scope", "key") NULLS NOT DISTINCT;
