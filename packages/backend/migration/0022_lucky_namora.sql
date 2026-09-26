-- hashtag の利用者 ID の配列を hashtag_user の行へ移す。配列の列は次の migration で消す。
-- 配列には削除済みの利用者の ID が残りうるので、存在する利用者だけを移す (外部キーを満たすため)。
-- *UsersCount は公開している数なので、配列からは数え直さずそのまま残す。
SET statement_timeout = 0;--> statement-breakpoint
INSERT INTO "hashtag_user" ("hashtagId", "attached", "userId")
SELECT DISTINCT h."id", false, m."userId"
FROM "hashtag" h
CROSS JOIN LATERAL unnest(h."mentionedUserIds") AS m("userId")
WHERE EXISTS (SELECT 1 FROM "user" u WHERE u."id" = m."userId")
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "hashtag_user" ("hashtagId", "attached", "userId")
SELECT DISTINCT h."id", true, a."userId"
FROM "hashtag" h
CROSS JOIN LATERAL unnest(h."attachedUserIds") AS a("userId")
WHERE EXISTS (SELECT 1 FROM "user" u WHERE u."id" = a."userId")
ON CONFLICT DO NOTHING;
