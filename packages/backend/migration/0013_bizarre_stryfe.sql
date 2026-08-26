ALTER TABLE "user" ADD COLUMN "suspensionTransitionId" varchar(32);

UPDATE "user" AS target
SET "suspensionTransitionId" = latest.id
FROM (
	SELECT DISTINCT ON (info->>'userId') id, info->>'userId' AS "userId"
	FROM "moderation_log"
	WHERE type IN ('suspend', 'unsuspend')
	ORDER BY info->>'userId', id DESC
) AS latest
WHERE target.id = latest."userId";
