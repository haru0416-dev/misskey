-- ロール定義と割り当ての世代番号。role / role_assignment への書き込みが API・Store 関数・生 SQL の
-- どれから来ても同じトリガで進むので、プロセス内のロールキャッシュはこの値だけで新旧を判定できる。
INSERT INTO "cache_version" ("key", "version") VALUES ('roles', 0) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION bump_roles_cache_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	UPDATE "cache_version" SET "version" = "version" + 1 WHERE "key" = 'roles';
	RETURN NULL;
END;
$$;

-- 文単位で 1 回だけ進める (行ごとに進めると一括削除で無駄に競合する)。TRUNCATE も対象にする。
CREATE TRIGGER "TRG_role_bump_cache_version"
	AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "role"
	FOR EACH STATEMENT EXECUTE FUNCTION bump_roles_cache_version();

CREATE TRIGGER "TRG_role_assignment_bump_cache_version"
	AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "role_assignment"
	FOR EACH STATEMENT EXECUTE FUNCTION bump_roles_cache_version();
