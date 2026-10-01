-- TRIGGER: role_assignment TRG_role_assignment_bump_cache_version
CREATE TRIGGER "TRG_role_assignment_bump_cache_version" AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON "public"."role_assignment" FOR EACH STATEMENT EXECUTE FUNCTION "public"."bump_roles_cache_version"();

-- TRIGGER: role TRG_role_bump_cache_version
CREATE TRIGGER "TRG_role_bump_cache_version" AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON "public"."role" FOR EACH STATEMENT EXECUTE FUNCTION "public"."bump_roles_cache_version"();
