-- src='list' なのに userListId を持たないアンテナは checkHitAntenna が常に false を返すため
-- 何にもマッチしない。CHECK制約を張る前に、マッチ結果を変えない形 (users が空の users アンテナ) へ寄せる。
UPDATE "antenna" SET "src" = 'users', "users" = '{}'::character varying[] WHERE "src" = 'list' AND "userListId" IS NULL;--> statement-breakpoint
ALTER TABLE "antenna" ADD CONSTRAINT "CHK_ANTENNA_LIST_SRC_REQUIRES_USER_LIST" CHECK ("antenna"."src" <> 'list' OR "antenna"."userListId" IS NOT NULL);
