-- EXTENSION: pg_trgm
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";

-- COMMENT: EXTENSION "pg_trgm"
COMMENT ON EXTENSION "pg_trgm" IS 'text similarity measurement and index searching based on trigrams';

-- TYPE: antenna_src_enum
CREATE TYPE "public"."antenna_src_enum" AS ENUM (
    'home',
    'all',
    'users',
    'list',
    'users_blacklist'
);

-- TYPE: instance_suspensionstate_enum
CREATE TYPE "public"."instance_suspensionstate_enum" AS ENUM (
    'none',
    'manuallySuspended',
    'goneSuspended',
    'autoSuspendedForNotResponding'
);

-- TYPE: meta_sensitivemediadetection_enum
CREATE TYPE "public"."meta_sensitivemediadetection_enum" AS ENUM (
    'none',
    'all',
    'local',
    'remote'
);

-- TYPE: meta_sensitivemediadetectionsensitivity_enum
CREATE TYPE "public"."meta_sensitivemediadetectionsensitivity_enum" AS ENUM (
    'medium',
    'low',
    'high',
    'veryLow',
    'veryHigh'
);

-- TYPE: note_draft_visibility_enum
CREATE TYPE "public"."note_draft_visibility_enum" AS ENUM (
    'public',
    'home',
    'followers',
    'specified'
);

-- TYPE: note_visibility_enum
CREATE TYPE "public"."note_visibility_enum" AS ENUM (
    'public',
    'home',
    'followers',
    'specified'
);

-- TYPE: page_visibility_enum
CREATE TYPE "public"."page_visibility_enum" AS ENUM (
    'public',
    'followers',
    'specified'
);

-- TYPE: poll_notevisibility_enum
CREATE TYPE "public"."poll_notevisibility_enum" AS ENUM (
    'public',
    'home',
    'followers',
    'specified'
);

-- TYPE: relay_status_enum
CREATE TYPE "public"."relay_status_enum" AS ENUM (
    'requesting',
    'accepted',
    'rejected'
);

-- TYPE: role_target_enum
CREATE TYPE "public"."role_target_enum" AS ENUM (
    'manual',
    'conditional'
);

-- TYPE: user_profile_followersvisibility_enum
CREATE TYPE "public"."user_profile_followersvisibility_enum" AS ENUM (
    'public',
    'followers',
    'private'
);

-- TYPE: user_profile_followingvisibility_enum
CREATE TYPE "public"."user_profile_followingvisibility_enum" AS ENUM (
    'public',
    'followers',
    'private'
);

-- FUNCTION: bump_roles_cache_version()
CREATE FUNCTION "public"."bump_roles_cache_version"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
	UPDATE "cache_version" SET "version" = "version" + 1 WHERE "key" = 'roles';
	RETURN NULL;
END;
$$;

-- FUNCTION: get_birthday_date("text")
CREATE FUNCTION "public"."get_birthday_date"("birthday" "text") RETURNS smallint
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$ BEGIN RETURN CAST((SUBSTR(birthday, 6, 2) || SUBSTR(birthday, 9, 2)) AS SMALLINT); END; $$;
