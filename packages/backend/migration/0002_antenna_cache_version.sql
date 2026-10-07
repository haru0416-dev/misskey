-- アンテナ一覧のプロセス内キャッシュの世代番号。投稿の照合はこの値が同じ間、一覧を読み直さない。
INSERT INTO "cache_version" ("key", "version") VALUES ('antennas', 0) ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
CREATE FUNCTION "public"."bump_antennas_cache_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
	UPDATE "cache_version" SET "version" = "version" + 1 WHERE "key" = 'antennas';
	RETURN NULL;
END;
$$;
--> statement-breakpoint
-- 外部キーの連鎖削除 (利用者・リストの削除) も文として実行されるので、この文単位トリガが進める。
CREATE TRIGGER "TRG_antenna_bump_cache_version" AFTER INSERT OR DELETE OR TRUNCATE ON "public"."antenna" FOR EACH STATEMENT EXECUTE FUNCTION "public"."bump_antennas_cache_version"();
--> statement-breakpoint
-- antennas/notes は閲覧のたびに lastUsedAt を書くので、それだけの更新では進めない。
-- 列を足しても照合に効く変更を取りこぼさないよう、列を列挙せず lastUsedAt 以外の差分で判定する。
CREATE TRIGGER "TRG_antenna_update_bump_cache_version" AFTER UPDATE ON "public"."antenna" FOR EACH ROW WHEN ((to_jsonb(OLD) - 'lastUsedAt') IS DISTINCT FROM (to_jsonb(NEW) - 'lastUsedAt')) EXECUTE FUNCTION "public"."bump_antennas_cache_version"();
