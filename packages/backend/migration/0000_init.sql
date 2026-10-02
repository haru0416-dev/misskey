-- 初期 migration。拡張機能・enum・関数・テーブル・index・外部キー・初期データ・トリガを、この順に作る。
-- drizzle-kit が出力できない DDL (チャート表・関数 index・trigram index・トリガ) も含む。以降の変更は新しい migration として足す。

-- EXTENSION: pg_trgm
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

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
--> statement-breakpoint
-- TABLE: __chart__active_users
CREATE TABLE "public"."__chart__active_users" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___readWrite" integer DEFAULT 0 NOT NULL,
    "unique_temp___read" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___read" integer DEFAULT 0 NOT NULL,
    "unique_temp___write" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___write" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredWithinWeek" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart__active_users_unique_temp___registeredWithinWe_not_null" NOT NULL,
    "___registeredWithinWeek" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredWithinMonth" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart__active_users_unique_temp___registeredWithinMo_not_null" NOT NULL,
    "___registeredWithinMonth" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredWithinYear" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart__active_users_unique_temp___registeredWithinYe_not_null" NOT NULL,
    "___registeredWithinYear" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredOutsideWeek" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart__active_users_unique_temp___registeredOutsideW_not_null" NOT NULL,
    "___registeredOutsideWeek" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredOutsideMonth" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart__active_users_unique_temp___registeredOutsideM_not_null" NOT NULL,
    "___registeredOutsideMonth" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredOutsideYear" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart__active_users_unique_temp___registeredOutsideY_not_null" NOT NULL,
    "___registeredOutsideYear" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart__active_users_id_seq
CREATE SEQUENCE "public"."__chart__active_users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__active_users_id_seq
ALTER SEQUENCE "public"."__chart__active_users_id_seq" OWNED BY "public"."__chart__active_users"."id";

-- DEFAULT: __chart__active_users id
ALTER TABLE ONLY "public"."__chart__active_users" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__active_users_id_seq"'::"regclass");

-- CONSTRAINT: __chart__active_users PK_317237a9f733b970604a11e314f
ALTER TABLE ONLY "public"."__chart__active_users"
    ADD CONSTRAINT "PK_317237a9f733b970604a11e314f" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__active_users UQ_0ad37b7ef50f4ddc84363d7ccca
ALTER TABLE ONLY "public"."__chart__active_users"
    ADD CONSTRAINT "UQ_0ad37b7ef50f4ddc84363d7ccca" UNIQUE ("date");

-- INDEX: IDX_CHART_HOUR_ACTIVE_USERS_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_ACTIVE_USERS_DATE_UNIQUE" ON "public"."__chart__active_users" USING "btree" ("date");
--> statement-breakpoint
-- TABLE: __chart__ap_request
CREATE TABLE "public"."__chart__ap_request" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___deliverFailed" integer DEFAULT 0 NOT NULL,
    "___deliverSucceeded" integer DEFAULT 0 NOT NULL,
    "___inboxReceived" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart__ap_request_id_seq
CREATE SEQUENCE "public"."__chart__ap_request_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__ap_request_id_seq
ALTER SEQUENCE "public"."__chart__ap_request_id_seq" OWNED BY "public"."__chart__ap_request"."id";

-- DEFAULT: __chart__ap_request id
ALTER TABLE ONLY "public"."__chart__ap_request" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__ap_request_id_seq"'::"regclass");

-- CONSTRAINT: __chart__ap_request PK_56a25cd447c7ee08876b3baf8d8
ALTER TABLE ONLY "public"."__chart__ap_request"
    ADD CONSTRAINT "PK_56a25cd447c7ee08876b3baf8d8" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__ap_request UQ_e56f4beac5746d44bc3e19c80d0
ALTER TABLE ONLY "public"."__chart__ap_request"
    ADD CONSTRAINT "UQ_e56f4beac5746d44bc3e19c80d0" UNIQUE ("date");

-- INDEX: IDX_CHART_HOUR_AP_REQUEST_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_AP_REQUEST_DATE_UNIQUE" ON "public"."__chart__ap_request" USING "btree" ("date");
--> statement-breakpoint
-- TABLE: __chart__drive
CREATE TABLE "public"."__chart__drive" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___local_incCount" integer DEFAULT 0 NOT NULL,
    "___local_incSize" integer DEFAULT 0 NOT NULL,
    "___local_decCount" integer DEFAULT 0 NOT NULL,
    "___local_decSize" integer DEFAULT 0 NOT NULL,
    "___remote_incCount" integer DEFAULT 0 NOT NULL,
    "___remote_incSize" integer DEFAULT 0 NOT NULL,
    "___remote_decCount" integer DEFAULT 0 NOT NULL,
    "___remote_decSize" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart__drive_id_seq
CREATE SEQUENCE "public"."__chart__drive_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__drive_id_seq
ALTER SEQUENCE "public"."__chart__drive_id_seq" OWNED BY "public"."__chart__drive"."id";

-- DEFAULT: __chart__drive id
ALTER TABLE ONLY "public"."__chart__drive" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__drive_id_seq"'::"regclass");

-- CONSTRAINT: __chart__drive PK_f96bc548a765cd4b3b354221ce7
ALTER TABLE ONLY "public"."__chart__drive"
    ADD CONSTRAINT "PK_f96bc548a765cd4b3b354221ce7" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__drive UQ_13565815f618a1ff53886c5b28a
ALTER TABLE ONLY "public"."__chart__drive"
    ADD CONSTRAINT "UQ_13565815f618a1ff53886c5b28a" UNIQUE ("date");

-- INDEX: IDX_CHART_HOUR_DRIVE_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_DRIVE_DATE_UNIQUE" ON "public"."__chart__drive" USING "btree" ("date");
--> statement-breakpoint
-- TABLE: __chart__federation
CREATE TABLE "public"."__chart__federation" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "unique_temp___deliveredInstances" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___deliveredInstances" smallint DEFAULT '0'::smallint NOT NULL,
    "unique_temp___inboxInstances" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___inboxInstances" smallint DEFAULT '0'::smallint NOT NULL,
    "unique_temp___stalled" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___stalled" smallint DEFAULT '0'::smallint NOT NULL,
    "___sub" smallint DEFAULT '0'::smallint NOT NULL,
    "___pub" smallint DEFAULT '0'::smallint NOT NULL,
    "___pubsub" smallint DEFAULT '0'::smallint NOT NULL,
    "___subActive" smallint DEFAULT '0'::smallint NOT NULL,
    "___pubActive" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart__federation_id_seq
CREATE SEQUENCE "public"."__chart__federation_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__federation_id_seq
ALTER SEQUENCE "public"."__chart__federation_id_seq" OWNED BY "public"."__chart__federation"."id";

-- DEFAULT: __chart__federation id
ALTER TABLE ONLY "public"."__chart__federation" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__federation_id_seq"'::"regclass");

-- CONSTRAINT: __chart__federation PK_b39dcd31a0fe1a7757e348e85fd
ALTER TABLE ONLY "public"."__chart__federation"
    ADD CONSTRAINT "PK_b39dcd31a0fe1a7757e348e85fd" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__federation UQ_36cb699c49580d4e6c2e6159f97
ALTER TABLE ONLY "public"."__chart__federation"
    ADD CONSTRAINT "UQ_36cb699c49580d4e6c2e6159f97" UNIQUE ("date");

-- INDEX: IDX_CHART_HOUR_FEDERATION_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_FEDERATION_DATE_UNIQUE" ON "public"."__chart__federation" USING "btree" ("date");
--> statement-breakpoint
-- TABLE: __chart__instance
CREATE TABLE "public"."__chart__instance" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___requests_failed" smallint DEFAULT '0'::smallint NOT NULL,
    "___requests_succeeded" smallint DEFAULT '0'::smallint NOT NULL,
    "___requests_received" smallint DEFAULT '0'::smallint NOT NULL,
    "___notes_total" integer DEFAULT 0 NOT NULL,
    "___notes_inc" integer DEFAULT 0 NOT NULL,
    "___notes_dec" integer DEFAULT 0 NOT NULL,
    "___notes_diffs_normal" integer DEFAULT 0 NOT NULL,
    "___notes_diffs_reply" integer DEFAULT 0 NOT NULL,
    "___notes_diffs_renote" integer DEFAULT 0 NOT NULL,
    "___notes_diffs_withFile" integer DEFAULT 0 NOT NULL,
    "___users_total" integer DEFAULT 0 NOT NULL,
    "___users_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___users_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___following_total" integer DEFAULT 0 NOT NULL,
    "___following_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___following_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___followers_total" integer DEFAULT 0 NOT NULL,
    "___followers_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___followers_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___drive_totalFiles" integer DEFAULT 0 NOT NULL,
    "___drive_incFiles" integer DEFAULT 0 NOT NULL,
    "___drive_decFiles" integer DEFAULT 0 NOT NULL,
    "___drive_incUsage" integer DEFAULT 0 NOT NULL,
    "___drive_decUsage" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart__instance_id_seq
CREATE SEQUENCE "public"."__chart__instance_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__instance_id_seq
ALTER SEQUENCE "public"."__chart__instance_id_seq" OWNED BY "public"."__chart__instance"."id";

-- DEFAULT: __chart__instance id
ALTER TABLE ONLY "public"."__chart__instance" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__instance_id_seq"'::"regclass");

-- CONSTRAINT: __chart__instance PK_1267c67c7c2d47b4903975f2c00
ALTER TABLE ONLY "public"."__chart__instance"
    ADD CONSTRAINT "PK_1267c67c7c2d47b4903975f2c00" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__instance UQ_39ee857ab2f23493037c6b66311
ALTER TABLE ONLY "public"."__chart__instance"
    ADD CONSTRAINT "UQ_39ee857ab2f23493037c6b66311" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_HOUR_INSTANCE_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_INSTANCE_DATE_GROUP_UNIQUE" ON "public"."__chart__instance" USING "btree" ("date", "group");
--> statement-breakpoint
-- TABLE: __chart__notes
CREATE TABLE "public"."__chart__notes" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___local_total" integer DEFAULT 0 NOT NULL,
    "___local_inc" integer DEFAULT 0 NOT NULL,
    "___local_dec" integer DEFAULT 0 NOT NULL,
    "___local_diffs_normal" integer DEFAULT 0 NOT NULL,
    "___local_diffs_reply" integer DEFAULT 0 NOT NULL,
    "___local_diffs_renote" integer DEFAULT 0 NOT NULL,
    "___local_diffs_withFile" integer DEFAULT 0 NOT NULL,
    "___remote_total" integer DEFAULT 0 NOT NULL,
    "___remote_inc" integer DEFAULT 0 NOT NULL,
    "___remote_dec" integer DEFAULT 0 NOT NULL,
    "___remote_diffs_normal" integer DEFAULT 0 NOT NULL,
    "___remote_diffs_reply" integer DEFAULT 0 NOT NULL,
    "___remote_diffs_renote" integer DEFAULT 0 NOT NULL,
    "___remote_diffs_withFile" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart__notes_id_seq
CREATE SEQUENCE "public"."__chart__notes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__notes_id_seq
ALTER SEQUENCE "public"."__chart__notes_id_seq" OWNED BY "public"."__chart__notes"."id";

-- DEFAULT: __chart__notes id
ALTER TABLE ONLY "public"."__chart__notes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__notes_id_seq"'::"regclass");

-- CONSTRAINT: __chart__notes PK_0aec823fa85c7f901bdb3863b14
ALTER TABLE ONLY "public"."__chart__notes"
    ADD CONSTRAINT "PK_0aec823fa85c7f901bdb3863b14" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__notes UQ_42eb716a37d381cdf566192b2be
ALTER TABLE ONLY "public"."__chart__notes"
    ADD CONSTRAINT "UQ_42eb716a37d381cdf566192b2be" UNIQUE ("date");

-- INDEX: IDX_CHART_HOUR_NOTES_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_NOTES_DATE_UNIQUE" ON "public"."__chart__notes" USING "btree" ("date");
--> statement-breakpoint
-- TABLE: __chart__per_user_drive
CREATE TABLE "public"."__chart__per_user_drive" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___totalCount" integer DEFAULT 0 NOT NULL,
    "___totalSize" integer DEFAULT 0 NOT NULL,
    "___incCount" smallint DEFAULT '0'::smallint NOT NULL,
    "___incSize" integer DEFAULT 0 NOT NULL,
    "___decCount" smallint DEFAULT '0'::smallint NOT NULL,
    "___decSize" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart__per_user_drive_id_seq
CREATE SEQUENCE "public"."__chart__per_user_drive_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__per_user_drive_id_seq
ALTER SEQUENCE "public"."__chart__per_user_drive_id_seq" OWNED BY "public"."__chart__per_user_drive"."id";

-- DEFAULT: __chart__per_user_drive id
ALTER TABLE ONLY "public"."__chart__per_user_drive" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__per_user_drive_id_seq"'::"regclass");

-- CONSTRAINT: __chart__per_user_drive PK_d0ef23d24d666e1a44a0cd3d208
ALTER TABLE ONLY "public"."__chart__per_user_drive"
    ADD CONSTRAINT "PK_d0ef23d24d666e1a44a0cd3d208" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__per_user_drive UQ_30bf67687f483ace115c5ca6429
ALTER TABLE ONLY "public"."__chart__per_user_drive"
    ADD CONSTRAINT "UQ_30bf67687f483ace115c5ca6429" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_HOUR_PER_USER_DRIVE_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_PER_USER_DRIVE_DATE_GROUP_UNIQUE" ON "public"."__chart__per_user_drive" USING "btree" ("date", "group");
--> statement-breakpoint
-- TABLE: __chart__per_user_following
CREATE TABLE "public"."__chart__per_user_following" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___local_followings_total" integer DEFAULT 0 NOT NULL,
    "___local_followings_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___local_followings_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___local_followers_total" integer DEFAULT 0 NOT NULL,
    "___local_followers_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___local_followers_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_followings_total" integer DEFAULT 0 NOT NULL,
    "___remote_followings_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_followings_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_followers_total" integer DEFAULT 0 NOT NULL,
    "___remote_followers_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_followers_dec" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart__per_user_following_id_seq
CREATE SEQUENCE "public"."__chart__per_user_following_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__per_user_following_id_seq
ALTER SEQUENCE "public"."__chart__per_user_following_id_seq" OWNED BY "public"."__chart__per_user_following"."id";

-- DEFAULT: __chart__per_user_following id
ALTER TABLE ONLY "public"."__chart__per_user_following" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__per_user_following_id_seq"'::"regclass");

-- CONSTRAINT: __chart__per_user_following PK_85bb1b540363a29c2fec83bd907
ALTER TABLE ONLY "public"."__chart__per_user_following"
    ADD CONSTRAINT "PK_85bb1b540363a29c2fec83bd907" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__per_user_following UQ_b77d4dd9562c3a899d9a286fcd7
ALTER TABLE ONLY "public"."__chart__per_user_following"
    ADD CONSTRAINT "UQ_b77d4dd9562c3a899d9a286fcd7" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_HOUR_PER_USER_FOLLOWING_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_PER_USER_FOLLOWING_DATE_GROUP_UNIQUE" ON "public"."__chart__per_user_following" USING "btree" ("date", "group");
--> statement-breakpoint
-- TABLE: __chart__per_user_notes
CREATE TABLE "public"."__chart__per_user_notes" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___total" integer DEFAULT 0 NOT NULL,
    "___inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___diffs_normal" smallint DEFAULT '0'::smallint NOT NULL,
    "___diffs_reply" smallint DEFAULT '0'::smallint NOT NULL,
    "___diffs_renote" smallint DEFAULT '0'::smallint NOT NULL,
    "___diffs_withFile" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart__per_user_notes_id_seq
CREATE SEQUENCE "public"."__chart__per_user_notes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__per_user_notes_id_seq
ALTER SEQUENCE "public"."__chart__per_user_notes_id_seq" OWNED BY "public"."__chart__per_user_notes"."id";

-- DEFAULT: __chart__per_user_notes id
ALTER TABLE ONLY "public"."__chart__per_user_notes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__per_user_notes_id_seq"'::"regclass");

-- CONSTRAINT: __chart__per_user_notes PK_334acf6e915af2f29edc11b8e50
ALTER TABLE ONLY "public"."__chart__per_user_notes"
    ADD CONSTRAINT "PK_334acf6e915af2f29edc11b8e50" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__per_user_notes UQ_5048e9daccbbbc6d567bb142d34
ALTER TABLE ONLY "public"."__chart__per_user_notes"
    ADD CONSTRAINT "UQ_5048e9daccbbbc6d567bb142d34" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_HOUR_PER_USER_NOTES_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_PER_USER_NOTES_DATE_GROUP_UNIQUE" ON "public"."__chart__per_user_notes" USING "btree" ("date", "group");
--> statement-breakpoint
-- TABLE: __chart__per_user_pv
CREATE TABLE "public"."__chart__per_user_pv" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "unique_temp___upv_user" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___upv_user" smallint DEFAULT '0'::smallint NOT NULL,
    "___pv_user" smallint DEFAULT '0'::smallint NOT NULL,
    "unique_temp___upv_visitor" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___upv_visitor" smallint DEFAULT '0'::smallint NOT NULL,
    "___pv_visitor" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart__per_user_pv_id_seq
CREATE SEQUENCE "public"."__chart__per_user_pv_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__per_user_pv_id_seq
ALTER SEQUENCE "public"."__chart__per_user_pv_id_seq" OWNED BY "public"."__chart__per_user_pv"."id";

-- DEFAULT: __chart__per_user_pv id
ALTER TABLE ONLY "public"."__chart__per_user_pv" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__per_user_pv_id_seq"'::"regclass");

-- CONSTRAINT: __chart__per_user_pv PK_3c938a24f0203b5bd13fab51059
ALTER TABLE ONLY "public"."__chart__per_user_pv"
    ADD CONSTRAINT "PK_3c938a24f0203b5bd13fab51059" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__per_user_pv UQ_f2a56da57921ca8439f45c1d95f
ALTER TABLE ONLY "public"."__chart__per_user_pv"
    ADD CONSTRAINT "UQ_f2a56da57921ca8439f45c1d95f" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_HOUR_PER_USER_PV_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_PER_USER_PV_DATE_GROUP_UNIQUE" ON "public"."__chart__per_user_pv" USING "btree" ("date", "group");
--> statement-breakpoint
-- TABLE: __chart__per_user_reaction
CREATE TABLE "public"."__chart__per_user_reaction" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___local_count" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_count" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart__per_user_reaction_id_seq
CREATE SEQUENCE "public"."__chart__per_user_reaction_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__per_user_reaction_id_seq
ALTER SEQUENCE "public"."__chart__per_user_reaction_id_seq" OWNED BY "public"."__chart__per_user_reaction"."id";

-- DEFAULT: __chart__per_user_reaction id
ALTER TABLE ONLY "public"."__chart__per_user_reaction" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__per_user_reaction_id_seq"'::"regclass");

-- CONSTRAINT: __chart__per_user_reaction PK_984f54dae441e65b633e8d27a7f
ALTER TABLE ONLY "public"."__chart__per_user_reaction"
    ADD CONSTRAINT "PK_984f54dae441e65b633e8d27a7f" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__per_user_reaction UQ_229a41ad465f9205f1f57032910
ALTER TABLE ONLY "public"."__chart__per_user_reaction"
    ADD CONSTRAINT "UQ_229a41ad465f9205f1f57032910" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_HOUR_PER_USER_REACTION_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_PER_USER_REACTION_DATE_GROUP_UNIQUE" ON "public"."__chart__per_user_reaction" USING "btree" ("date", "group");
--> statement-breakpoint
-- TABLE: __chart__users
CREATE TABLE "public"."__chart__users" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___local_total" integer DEFAULT 0 NOT NULL,
    "___local_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___local_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_total" integer DEFAULT 0 NOT NULL,
    "___remote_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_dec" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart__users_id_seq
CREATE SEQUENCE "public"."__chart__users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__users_id_seq
ALTER SEQUENCE "public"."__chart__users_id_seq" OWNED BY "public"."__chart__users"."id";

-- DEFAULT: __chart__users id
ALTER TABLE ONLY "public"."__chart__users" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__users_id_seq"'::"regclass");

-- CONSTRAINT: __chart__users PK_4dfcf2c78d03524b9eb2c99d328
ALTER TABLE ONLY "public"."__chart__users"
    ADD CONSTRAINT "PK_4dfcf2c78d03524b9eb2c99d328" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__users UQ_845254b3eaf708ae8a6cac30265
ALTER TABLE ONLY "public"."__chart__users"
    ADD CONSTRAINT "UQ_845254b3eaf708ae8a6cac30265" UNIQUE ("date");

-- INDEX: IDX_CHART_HOUR_USERS_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_USERS_DATE_UNIQUE" ON "public"."__chart__users" USING "btree" ("date");
--> statement-breakpoint
-- TABLE: __chart_day__active_users
CREATE TABLE "public"."__chart_day__active_users" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___readWrite" integer DEFAULT 0 NOT NULL,
    "unique_temp___read" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___read" integer DEFAULT 0 NOT NULL,
    "unique_temp___write" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___write" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredWithinWeek" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__active_users_unique_temp___registeredWith_not_null" NOT NULL,
    "___registeredWithinWeek" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredWithinMonth" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__active_users_unique_temp___registeredWit_not_null1" NOT NULL,
    "___registeredWithinMonth" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredWithinYear" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__active_users_unique_temp___registeredWit_not_null2" NOT NULL,
    "___registeredWithinYear" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredOutsideWeek" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__active_users_unique_temp___registeredOuts_not_null" NOT NULL,
    "___registeredOutsideWeek" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredOutsideMonth" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__active_users_unique_temp___registeredOut_not_null1" NOT NULL,
    "___registeredOutsideMonth" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredOutsideYear" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__active_users_unique_temp___registeredOut_not_null2" NOT NULL,
    "___registeredOutsideYear" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart_day__active_users_id_seq
CREATE SEQUENCE "public"."__chart_day__active_users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__active_users_id_seq
ALTER SEQUENCE "public"."__chart_day__active_users_id_seq" OWNED BY "public"."__chart_day__active_users"."id";

-- DEFAULT: __chart_day__active_users id
ALTER TABLE ONLY "public"."__chart_day__active_users" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__active_users_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__active_users PK_b1790489b14f005ae8f404f5795
ALTER TABLE ONLY "public"."__chart_day__active_users"
    ADD CONSTRAINT "PK_b1790489b14f005ae8f404f5795" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__active_users UQ_d5954f3df5e5e3bdfc3c03f3906
ALTER TABLE ONLY "public"."__chart_day__active_users"
    ADD CONSTRAINT "UQ_d5954f3df5e5e3bdfc3c03f3906" UNIQUE ("date");

-- INDEX: IDX_CHART_DAY_ACTIVE_USERS_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_ACTIVE_USERS_DATE_UNIQUE" ON "public"."__chart_day__active_users" USING "btree" ("date");
--> statement-breakpoint
-- TABLE: __chart_day__ap_request
CREATE TABLE "public"."__chart_day__ap_request" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___deliverFailed" integer DEFAULT 0 NOT NULL,
    "___deliverSucceeded" integer DEFAULT 0 NOT NULL,
    "___inboxReceived" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart_day__ap_request_id_seq
CREATE SEQUENCE "public"."__chart_day__ap_request_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__ap_request_id_seq
ALTER SEQUENCE "public"."__chart_day__ap_request_id_seq" OWNED BY "public"."__chart_day__ap_request"."id";

-- DEFAULT: __chart_day__ap_request id
ALTER TABLE ONLY "public"."__chart_day__ap_request" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__ap_request_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__ap_request PK_9318b49daee320194e23f712e69
ALTER TABLE ONLY "public"."__chart_day__ap_request"
    ADD CONSTRAINT "PK_9318b49daee320194e23f712e69" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__ap_request UQ_a848f66d6cec11980a5dd595822
ALTER TABLE ONLY "public"."__chart_day__ap_request"
    ADD CONSTRAINT "UQ_a848f66d6cec11980a5dd595822" UNIQUE ("date");

-- INDEX: IDX_CHART_DAY_AP_REQUEST_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_AP_REQUEST_DATE_UNIQUE" ON "public"."__chart_day__ap_request" USING "btree" ("date");
--> statement-breakpoint
-- TABLE: __chart_day__drive
CREATE TABLE "public"."__chart_day__drive" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___local_incCount" integer DEFAULT 0 NOT NULL,
    "___local_incSize" integer DEFAULT 0 NOT NULL,
    "___local_decCount" integer DEFAULT 0 NOT NULL,
    "___local_decSize" integer DEFAULT 0 NOT NULL,
    "___remote_incCount" integer DEFAULT 0 NOT NULL,
    "___remote_incSize" integer DEFAULT 0 NOT NULL,
    "___remote_decCount" integer DEFAULT 0 NOT NULL,
    "___remote_decSize" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart_day__drive_id_seq
CREATE SEQUENCE "public"."__chart_day__drive_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__drive_id_seq
ALTER SEQUENCE "public"."__chart_day__drive_id_seq" OWNED BY "public"."__chart_day__drive"."id";

-- DEFAULT: __chart_day__drive id
ALTER TABLE ONLY "public"."__chart_day__drive" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__drive_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__drive PK_e7ec0de057c77c40fc8d8b62151
ALTER TABLE ONLY "public"."__chart_day__drive"
    ADD CONSTRAINT "PK_e7ec0de057c77c40fc8d8b62151" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__drive UQ_0b60ebb3aa0065f10b0616c1171
ALTER TABLE ONLY "public"."__chart_day__drive"
    ADD CONSTRAINT "UQ_0b60ebb3aa0065f10b0616c1171" UNIQUE ("date");

-- INDEX: IDX_CHART_DAY_DRIVE_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_DRIVE_DATE_UNIQUE" ON "public"."__chart_day__drive" USING "btree" ("date");
--> statement-breakpoint
-- TABLE: __chart_day__federation
CREATE TABLE "public"."__chart_day__federation" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "unique_temp___deliveredInstances" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__federation_unique_temp___deliveredInstanc_not_null" NOT NULL,
    "___deliveredInstances" smallint DEFAULT '0'::smallint NOT NULL,
    "unique_temp___inboxInstances" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___inboxInstances" smallint DEFAULT '0'::smallint NOT NULL,
    "unique_temp___stalled" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___stalled" smallint DEFAULT '0'::smallint NOT NULL,
    "___sub" smallint DEFAULT '0'::smallint NOT NULL,
    "___pub" smallint DEFAULT '0'::smallint NOT NULL,
    "___pubsub" smallint DEFAULT '0'::smallint NOT NULL,
    "___subActive" smallint DEFAULT '0'::smallint NOT NULL,
    "___pubActive" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart_day__federation_id_seq
CREATE SEQUENCE "public"."__chart_day__federation_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__federation_id_seq
ALTER SEQUENCE "public"."__chart_day__federation_id_seq" OWNED BY "public"."__chart_day__federation"."id";

-- DEFAULT: __chart_day__federation id
ALTER TABLE ONLY "public"."__chart_day__federation" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__federation_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__federation PK_7ca721c769f31698e0e1331e8e6
ALTER TABLE ONLY "public"."__chart_day__federation"
    ADD CONSTRAINT "PK_7ca721c769f31698e0e1331e8e6" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__federation UQ_617a8fe225a6e701d89e02d2c74
ALTER TABLE ONLY "public"."__chart_day__federation"
    ADD CONSTRAINT "UQ_617a8fe225a6e701d89e02d2c74" UNIQUE ("date");

-- INDEX: IDX_CHART_DAY_FEDERATION_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_FEDERATION_DATE_UNIQUE" ON "public"."__chart_day__federation" USING "btree" ("date");
--> statement-breakpoint
-- TABLE: __chart_day__instance
CREATE TABLE "public"."__chart_day__instance" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___requests_failed" smallint DEFAULT '0'::smallint NOT NULL,
    "___requests_succeeded" smallint DEFAULT '0'::smallint NOT NULL,
    "___requests_received" smallint DEFAULT '0'::smallint NOT NULL,
    "___notes_total" integer DEFAULT 0 NOT NULL,
    "___notes_inc" integer DEFAULT 0 NOT NULL,
    "___notes_dec" integer DEFAULT 0 NOT NULL,
    "___notes_diffs_normal" integer DEFAULT 0 NOT NULL,
    "___notes_diffs_reply" integer DEFAULT 0 NOT NULL,
    "___notes_diffs_renote" integer DEFAULT 0 NOT NULL,
    "___notes_diffs_withFile" integer DEFAULT 0 NOT NULL,
    "___users_total" integer DEFAULT 0 NOT NULL,
    "___users_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___users_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___following_total" integer DEFAULT 0 NOT NULL,
    "___following_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___following_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___followers_total" integer DEFAULT 0 NOT NULL,
    "___followers_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___followers_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___drive_totalFiles" integer DEFAULT 0 NOT NULL,
    "___drive_incFiles" integer DEFAULT 0 NOT NULL,
    "___drive_decFiles" integer DEFAULT 0 NOT NULL,
    "___drive_incUsage" integer DEFAULT 0 NOT NULL,
    "___drive_decUsage" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart_day__instance_id_seq
CREATE SEQUENCE "public"."__chart_day__instance_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__instance_id_seq
ALTER SEQUENCE "public"."__chart_day__instance_id_seq" OWNED BY "public"."__chart_day__instance"."id";

-- DEFAULT: __chart_day__instance id
ALTER TABLE ONLY "public"."__chart_day__instance" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__instance_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__instance PK_479a8ff9d959274981087043023
ALTER TABLE ONLY "public"."__chart_day__instance"
    ADD CONSTRAINT "PK_479a8ff9d959274981087043023" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__instance UQ_fea7c0278325a1a2492f2d6acbf
ALTER TABLE ONLY "public"."__chart_day__instance"
    ADD CONSTRAINT "UQ_fea7c0278325a1a2492f2d6acbf" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_DAY_INSTANCE_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_INSTANCE_DATE_GROUP_UNIQUE" ON "public"."__chart_day__instance" USING "btree" ("date", "group");
--> statement-breakpoint
-- TABLE: __chart_day__notes
CREATE TABLE "public"."__chart_day__notes" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___local_total" integer DEFAULT 0 NOT NULL,
    "___local_inc" integer DEFAULT 0 NOT NULL,
    "___local_dec" integer DEFAULT 0 NOT NULL,
    "___local_diffs_normal" integer DEFAULT 0 NOT NULL,
    "___local_diffs_reply" integer DEFAULT 0 NOT NULL,
    "___local_diffs_renote" integer DEFAULT 0 NOT NULL,
    "___local_diffs_withFile" integer DEFAULT 0 NOT NULL,
    "___remote_total" integer DEFAULT 0 NOT NULL,
    "___remote_inc" integer DEFAULT 0 NOT NULL,
    "___remote_dec" integer DEFAULT 0 NOT NULL,
    "___remote_diffs_normal" integer DEFAULT 0 NOT NULL,
    "___remote_diffs_reply" integer DEFAULT 0 NOT NULL,
    "___remote_diffs_renote" integer DEFAULT 0 NOT NULL,
    "___remote_diffs_withFile" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart_day__notes_id_seq
CREATE SEQUENCE "public"."__chart_day__notes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__notes_id_seq
ALTER SEQUENCE "public"."__chart_day__notes_id_seq" OWNED BY "public"."__chart_day__notes"."id";

-- DEFAULT: __chart_day__notes id
ALTER TABLE ONLY "public"."__chart_day__notes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__notes_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__notes PK_1fa4139e1f338272b758d05e090
ALTER TABLE ONLY "public"."__chart_day__notes"
    ADD CONSTRAINT "PK_1fa4139e1f338272b758d05e090" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__notes UQ_1a527b423ad0858a1af5a056d43
ALTER TABLE ONLY "public"."__chart_day__notes"
    ADD CONSTRAINT "UQ_1a527b423ad0858a1af5a056d43" UNIQUE ("date");

-- INDEX: IDX_CHART_DAY_NOTES_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_NOTES_DATE_UNIQUE" ON "public"."__chart_day__notes" USING "btree" ("date");
--> statement-breakpoint
-- TABLE: __chart_day__per_user_drive
CREATE TABLE "public"."__chart_day__per_user_drive" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___totalCount" integer DEFAULT 0 NOT NULL,
    "___totalSize" integer DEFAULT 0 NOT NULL,
    "___incCount" smallint DEFAULT '0'::smallint NOT NULL,
    "___incSize" integer DEFAULT 0 NOT NULL,
    "___decCount" smallint DEFAULT '0'::smallint NOT NULL,
    "___decSize" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart_day__per_user_drive_id_seq
CREATE SEQUENCE "public"."__chart_day__per_user_drive_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__per_user_drive_id_seq
ALTER SEQUENCE "public"."__chart_day__per_user_drive_id_seq" OWNED BY "public"."__chart_day__per_user_drive"."id";

-- DEFAULT: __chart_day__per_user_drive id
ALTER TABLE ONLY "public"."__chart_day__per_user_drive" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__per_user_drive_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__per_user_drive PK_1ae135254c137011645da7f4045
ALTER TABLE ONLY "public"."__chart_day__per_user_drive"
    ADD CONSTRAINT "PK_1ae135254c137011645da7f4045" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__per_user_drive UQ_62aa5047b5aec92524f24c701d7
ALTER TABLE ONLY "public"."__chart_day__per_user_drive"
    ADD CONSTRAINT "UQ_62aa5047b5aec92524f24c701d7" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_DAY_PER_USER_DRIVE_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_PER_USER_DRIVE_DATE_GROUP_UNIQUE" ON "public"."__chart_day__per_user_drive" USING "btree" ("date", "group");
--> statement-breakpoint
-- TABLE: __chart_day__per_user_following
CREATE TABLE "public"."__chart_day__per_user_following" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___local_followings_total" integer DEFAULT 0 CONSTRAINT "__chart_day__per_user_follow____local_followings_total_not_null" NOT NULL,
    "___local_followings_inc" smallint DEFAULT '0'::smallint CONSTRAINT "__chart_day__per_user_followin____local_followings_inc_not_null" NOT NULL,
    "___local_followings_dec" smallint DEFAULT '0'::smallint CONSTRAINT "__chart_day__per_user_followin____local_followings_dec_not_null" NOT NULL,
    "___local_followers_total" integer DEFAULT 0 CONSTRAINT "__chart_day__per_user_followi____local_followers_total_not_null" NOT NULL,
    "___local_followers_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___local_followers_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_followings_total" integer DEFAULT 0 CONSTRAINT "__chart_day__per_user_follo____remote_followings_total_not_null" NOT NULL,
    "___remote_followings_inc" smallint DEFAULT '0'::smallint CONSTRAINT "__chart_day__per_user_followi____remote_followings_inc_not_null" NOT NULL,
    "___remote_followings_dec" smallint DEFAULT '0'::smallint CONSTRAINT "__chart_day__per_user_followi____remote_followings_dec_not_null" NOT NULL,
    "___remote_followers_total" integer DEFAULT 0 CONSTRAINT "__chart_day__per_user_follow____remote_followers_total_not_null" NOT NULL,
    "___remote_followers_inc" smallint DEFAULT '0'::smallint CONSTRAINT "__chart_day__per_user_followin____remote_followers_inc_not_null" NOT NULL,
    "___remote_followers_dec" smallint DEFAULT '0'::smallint CONSTRAINT "__chart_day__per_user_followin____remote_followers_dec_not_null" NOT NULL
);

-- SEQUENCE: __chart_day__per_user_following_id_seq
CREATE SEQUENCE "public"."__chart_day__per_user_following_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__per_user_following_id_seq
ALTER SEQUENCE "public"."__chart_day__per_user_following_id_seq" OWNED BY "public"."__chart_day__per_user_following"."id";

-- DEFAULT: __chart_day__per_user_following id
ALTER TABLE ONLY "public"."__chart_day__per_user_following" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__per_user_following_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__per_user_following PK_68ce6b67da57166da66fc8fb27e
ALTER TABLE ONLY "public"."__chart_day__per_user_following"
    ADD CONSTRAINT "PK_68ce6b67da57166da66fc8fb27e" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__per_user_following UQ_e4849a3231f38281280ea4c0eee
ALTER TABLE ONLY "public"."__chart_day__per_user_following"
    ADD CONSTRAINT "UQ_e4849a3231f38281280ea4c0eee" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_DAY_PER_USER_FOLLOWING_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_PER_USER_FOLLOWING_DATE_GROUP_UNIQUE" ON "public"."__chart_day__per_user_following" USING "btree" ("date", "group");
--> statement-breakpoint
-- TABLE: __chart_day__per_user_notes
CREATE TABLE "public"."__chart_day__per_user_notes" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___total" integer DEFAULT 0 NOT NULL,
    "___inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___diffs_normal" smallint DEFAULT '0'::smallint NOT NULL,
    "___diffs_reply" smallint DEFAULT '0'::smallint NOT NULL,
    "___diffs_renote" smallint DEFAULT '0'::smallint NOT NULL,
    "___diffs_withFile" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart_day__per_user_notes_id_seq
CREATE SEQUENCE "public"."__chart_day__per_user_notes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__per_user_notes_id_seq
ALTER SEQUENCE "public"."__chart_day__per_user_notes_id_seq" OWNED BY "public"."__chart_day__per_user_notes"."id";

-- DEFAULT: __chart_day__per_user_notes id
ALTER TABLE ONLY "public"."__chart_day__per_user_notes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__per_user_notes_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__per_user_notes PK_58bab6b6d3ad9310cbc7460fd28
ALTER TABLE ONLY "public"."__chart_day__per_user_notes"
    ADD CONSTRAINT "PK_58bab6b6d3ad9310cbc7460fd28" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__per_user_notes UQ_c5545d4b31cdc684034e33b81c3
ALTER TABLE ONLY "public"."__chart_day__per_user_notes"
    ADD CONSTRAINT "UQ_c5545d4b31cdc684034e33b81c3" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_DAY_PER_USER_NOTES_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_PER_USER_NOTES_DATE_GROUP_UNIQUE" ON "public"."__chart_day__per_user_notes" USING "btree" ("date", "group");
--> statement-breakpoint
-- TABLE: __chart_day__per_user_pv
CREATE TABLE "public"."__chart_day__per_user_pv" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "unique_temp___upv_user" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___upv_user" smallint DEFAULT '0'::smallint NOT NULL,
    "___pv_user" smallint DEFAULT '0'::smallint NOT NULL,
    "unique_temp___upv_visitor" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___upv_visitor" smallint DEFAULT '0'::smallint NOT NULL,
    "___pv_visitor" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart_day__per_user_pv_id_seq
CREATE SEQUENCE "public"."__chart_day__per_user_pv_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__per_user_pv_id_seq
ALTER SEQUENCE "public"."__chart_day__per_user_pv_id_seq" OWNED BY "public"."__chart_day__per_user_pv"."id";

-- DEFAULT: __chart_day__per_user_pv id
ALTER TABLE ONLY "public"."__chart_day__per_user_pv" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__per_user_pv_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__per_user_pv PK_0085d7542f6772e99b9dcfb0a9c
ALTER TABLE ONLY "public"."__chart_day__per_user_pv"
    ADD CONSTRAINT "PK_0085d7542f6772e99b9dcfb0a9c" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__per_user_pv UQ_f221e45cfac5bea0ce0f3149fbb
ALTER TABLE ONLY "public"."__chart_day__per_user_pv"
    ADD CONSTRAINT "UQ_f221e45cfac5bea0ce0f3149fbb" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_DAY_PER_USER_PV_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_PER_USER_PV_DATE_GROUP_UNIQUE" ON "public"."__chart_day__per_user_pv" USING "btree" ("date", "group");
--> statement-breakpoint
-- TABLE: __chart_day__per_user_reaction
CREATE TABLE "public"."__chart_day__per_user_reaction" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___local_count" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_count" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart_day__per_user_reaction_id_seq
CREATE SEQUENCE "public"."__chart_day__per_user_reaction_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__per_user_reaction_id_seq
ALTER SEQUENCE "public"."__chart_day__per_user_reaction_id_seq" OWNED BY "public"."__chart_day__per_user_reaction"."id";

-- DEFAULT: __chart_day__per_user_reaction id
ALTER TABLE ONLY "public"."__chart_day__per_user_reaction" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__per_user_reaction_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__per_user_reaction PK_8af24e2d51ff781a354fe595eda
ALTER TABLE ONLY "public"."__chart_day__per_user_reaction"
    ADD CONSTRAINT "PK_8af24e2d51ff781a354fe595eda" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__per_user_reaction UQ_d54b653660d808b118e36c184c0
ALTER TABLE ONLY "public"."__chart_day__per_user_reaction"
    ADD CONSTRAINT "UQ_d54b653660d808b118e36c184c0" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_DAY_PER_USER_REACTION_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_PER_USER_REACTION_DATE_GROUP_UNIQUE" ON "public"."__chart_day__per_user_reaction" USING "btree" ("date", "group");
--> statement-breakpoint
-- TABLE: __chart_day__users
CREATE TABLE "public"."__chart_day__users" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___local_total" integer DEFAULT 0 NOT NULL,
    "___local_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___local_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_total" integer DEFAULT 0 NOT NULL,
    "___remote_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_dec" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart_day__users_id_seq
CREATE SEQUENCE "public"."__chart_day__users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__users_id_seq
ALTER SEQUENCE "public"."__chart_day__users_id_seq" OWNED BY "public"."__chart_day__users"."id";

-- DEFAULT: __chart_day__users id
ALTER TABLE ONLY "public"."__chart_day__users" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__users_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__users PK_d7f7185abb9851f70c4726c54bd
ALTER TABLE ONLY "public"."__chart_day__users"
    ADD CONSTRAINT "PK_d7f7185abb9851f70c4726c54bd" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__users UQ_cad6e07c20037f31cdba8a350c3
ALTER TABLE ONLY "public"."__chart_day__users"
    ADD CONSTRAINT "UQ_cad6e07c20037f31cdba8a350c3" UNIQUE ("date");

-- INDEX: IDX_CHART_DAY_USERS_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_USERS_DATE_UNIQUE" ON "public"."__chart_day__users" USING "btree" ("date");
--> statement-breakpoint
-- TABLE: abuse_report_notification_recipient
CREATE TABLE "public"."abuse_report_notification_recipient" (
    "id" character varying(32) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "method" character varying(64) NOT NULL,
    "userId" character varying(32) DEFAULT NULL::character varying,
    "systemWebhookId" character varying(32) DEFAULT NULL::character varying
);

-- CONSTRAINT: abuse_report_notification_recipient abuse_report_notification_recipient_pkey
ALTER TABLE ONLY "public"."abuse_report_notification_recipient"
    ADD CONSTRAINT "abuse_report_notification_recipient_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_abuse_report_notification_recipient_isActive
CREATE INDEX "IDX_abuse_report_notification_recipient_isActive" ON "public"."abuse_report_notification_recipient" USING "btree" ("isActive");

-- INDEX: IDX_abuse_report_notification_recipient_method
CREATE INDEX "IDX_abuse_report_notification_recipient_method" ON "public"."abuse_report_notification_recipient" USING "btree" ("method");

-- INDEX: IDX_abuse_report_notification_recipient_systemWebhookId
CREATE INDEX "IDX_abuse_report_notification_recipient_systemWebhookId" ON "public"."abuse_report_notification_recipient" USING "btree" ("systemWebhookId");

-- INDEX: IDX_abuse_report_notification_recipient_userId
CREATE INDEX "IDX_abuse_report_notification_recipient_userId" ON "public"."abuse_report_notification_recipient" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: abuse_user_report
CREATE TABLE "public"."abuse_user_report" (
    "id" character varying(32) NOT NULL,
    "targetUserId" character varying(32) NOT NULL,
    "reporterId" character varying(32) NOT NULL,
    "assigneeId" character varying(32),
    "resolved" boolean DEFAULT false NOT NULL,
    "forwarded" boolean DEFAULT false NOT NULL,
    "comment" character varying(2048) NOT NULL,
    "moderationNote" character varying(8192) DEFAULT ''::character varying NOT NULL,
    "resolvedAs" character varying(128),
    "targetUserHost" character varying(128),
    "reporterHost" character varying(128)
);

-- CONSTRAINT: abuse_user_report abuse_user_report_pkey
ALTER TABLE ONLY "public"."abuse_user_report"
    ADD CONSTRAINT "abuse_user_report_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ABUSE_USER_REPORT_ASSIGNEE_ID
CREATE INDEX "IDX_ABUSE_USER_REPORT_ASSIGNEE_ID" ON "public"."abuse_user_report" USING "btree" ("assigneeId");

-- INDEX: IDX_ABUSE_USER_REPORT_REPORTER_HOST
CREATE INDEX "IDX_ABUSE_USER_REPORT_REPORTER_HOST" ON "public"."abuse_user_report" USING "btree" ("reporterHost");

-- INDEX: IDX_ABUSE_USER_REPORT_REPORTER_HOST_ID
CREATE INDEX "IDX_ABUSE_USER_REPORT_REPORTER_HOST_ID" ON "public"."abuse_user_report" USING "btree" ("reporterHost", "id");

-- INDEX: IDX_ABUSE_USER_REPORT_REPORTER_ID
CREATE INDEX "IDX_ABUSE_USER_REPORT_REPORTER_ID" ON "public"."abuse_user_report" USING "btree" ("reporterId");

-- INDEX: IDX_ABUSE_USER_REPORT_RESOLVED
CREATE INDEX "IDX_ABUSE_USER_REPORT_RESOLVED" ON "public"."abuse_user_report" USING "btree" ("resolved");

-- INDEX: IDX_ABUSE_USER_REPORT_RESOLVED_ID
CREATE INDEX "IDX_ABUSE_USER_REPORT_RESOLVED_ID" ON "public"."abuse_user_report" USING "btree" ("resolved", "id");

-- INDEX: IDX_ABUSE_USER_REPORT_TARGET_HOST_ID
CREATE INDEX "IDX_ABUSE_USER_REPORT_TARGET_HOST_ID" ON "public"."abuse_user_report" USING "btree" ("targetUserHost", "id");

-- INDEX: IDX_ABUSE_USER_REPORT_TARGET_USER_HOST
CREATE INDEX "IDX_ABUSE_USER_REPORT_TARGET_USER_HOST" ON "public"."abuse_user_report" USING "btree" ("targetUserHost");

-- INDEX: IDX_ABUSE_USER_REPORT_TARGET_USER_ID
CREATE INDEX "IDX_ABUSE_USER_REPORT_TARGET_USER_ID" ON "public"."abuse_user_report" USING "btree" ("targetUserId");
--> statement-breakpoint
-- TABLE: access_token
CREATE TABLE "public"."access_token" (
    "id" character varying(32) NOT NULL,
    "lastUsedAt" timestamp with time zone,
    "token" character varying(128) NOT NULL,
    "session" character varying(128),
    "userId" character varying(32) NOT NULL,
    "name" character varying(128),
    "description" character varying(512),
    "iconUrl" character varying(512),
    "permission" character varying(64)[] DEFAULT '{}'::character varying[] NOT NULL,
    "fetched" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: access_token access_token_pkey
ALTER TABLE ONLY "public"."access_token"
    ADD CONSTRAINT "access_token_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ACCESS_TOKEN_SESSION
CREATE INDEX "IDX_ACCESS_TOKEN_SESSION" ON "public"."access_token" USING "btree" ("session");

-- INDEX: IDX_ACCESS_TOKEN_TOKEN
CREATE INDEX "IDX_ACCESS_TOKEN_TOKEN" ON "public"."access_token" USING "btree" ("token");

-- INDEX: IDX_ACCESS_TOKEN_USER_ID
CREATE INDEX "IDX_ACCESS_TOKEN_USER_ID" ON "public"."access_token" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: ad
CREATE TABLE "public"."ad" (
    "id" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "startsAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "place" character varying(32) NOT NULL,
    "priority" character varying(32) NOT NULL,
    "ratio" integer DEFAULT 1 NOT NULL,
    "url" character varying(1024) NOT NULL,
    "imageUrl" character varying(1024) NOT NULL,
    "memo" character varying(8192) NOT NULL,
    "dayOfWeek" integer DEFAULT 0 NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: ad ad_pkey
ALTER TABLE ONLY "public"."ad"
    ADD CONSTRAINT "ad_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_AD_EXPIRES_AT
CREATE INDEX "IDX_AD_EXPIRES_AT" ON "public"."ad" USING "btree" ("expiresAt");

-- INDEX: IDX_AD_STARTS_AT
CREATE INDEX "IDX_AD_STARTS_AT" ON "public"."ad" USING "btree" ("startsAt");
--> statement-breakpoint
-- TABLE: announcement
CREATE TABLE "public"."announcement" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone,
    "text" character varying(8192) NOT NULL,
    "title" character varying(256) NOT NULL,
    "imageUrl" character varying(1024),
    "icon" character varying(256) DEFAULT 'info'::character varying NOT NULL,
    "display" character varying(256) DEFAULT 'normal'::character varying NOT NULL,
    "needConfirmationToRead" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "forExistingUsers" boolean DEFAULT false NOT NULL,
    "silence" boolean DEFAULT false NOT NULL,
    "userId" character varying(32)
);

-- CONSTRAINT: announcement announcement_pkey
ALTER TABLE ONLY "public"."announcement"
    ADD CONSTRAINT "announcement_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ANNOUNCEMENT_FOR_EXISTING_USERS
CREATE INDEX "IDX_ANNOUNCEMENT_FOR_EXISTING_USERS" ON "public"."announcement" USING "btree" ("forExistingUsers");

-- INDEX: IDX_ANNOUNCEMENT_IS_ACTIVE
CREATE INDEX "IDX_ANNOUNCEMENT_IS_ACTIVE" ON "public"."announcement" USING "btree" ("isActive");

-- INDEX: IDX_ANNOUNCEMENT_SILENCE
CREATE INDEX "IDX_ANNOUNCEMENT_SILENCE" ON "public"."announcement" USING "btree" ("silence");

-- INDEX: IDX_ANNOUNCEMENT_USER_ID
CREATE INDEX "IDX_ANNOUNCEMENT_USER_ID" ON "public"."announcement" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: announcement_reaction
CREATE TABLE "public"."announcement_reaction" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "announcementId" character varying(32) NOT NULL,
    "reaction" character varying(260) NOT NULL
);

-- CONSTRAINT: announcement_reaction announcement_reaction_pkey
ALTER TABLE ONLY "public"."announcement_reaction"
    ADD CONSTRAINT "announcement_reaction_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ANNOUNCEMENT_REACTION_ANNOUNCEMENT_ID
CREATE INDEX "IDX_ANNOUNCEMENT_REACTION_ANNOUNCEMENT_ID" ON "public"."announcement_reaction" USING "btree" ("announcementId");

-- INDEX: IDX_ANNOUNCEMENT_REACTION_USER_ID_ANNOUNCEMENT_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_ANNOUNCEMENT_REACTION_USER_ID_ANNOUNCEMENT_ID_UNIQUE" ON "public"."announcement_reaction" USING "btree" ("userId", "announcementId");
--> statement-breakpoint
-- TABLE: announcement_read
CREATE TABLE "public"."announcement_read" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "announcementId" character varying(32) NOT NULL
);

-- CONSTRAINT: announcement_read announcement_read_pkey
ALTER TABLE ONLY "public"."announcement_read"
    ADD CONSTRAINT "announcement_read_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ANNOUNCEMENT_READ_ANNOUNCEMENT_ID
CREATE INDEX "IDX_ANNOUNCEMENT_READ_ANNOUNCEMENT_ID" ON "public"."announcement_read" USING "btree" ("announcementId");

-- INDEX: IDX_ANNOUNCEMENT_READ_USER_ID
CREATE INDEX "IDX_ANNOUNCEMENT_READ_USER_ID" ON "public"."announcement_read" USING "btree" ("userId");

-- INDEX: IDX_ANNOUNCEMENT_READ_USER_ID_ANNOUNCEMENT_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_ANNOUNCEMENT_READ_USER_ID_ANNOUNCEMENT_ID_UNIQUE" ON "public"."announcement_read" USING "btree" ("userId", "announcementId");
--> statement-breakpoint
-- TABLE: antenna
CREATE TABLE "public"."antenna" (
    "id" character varying(32) NOT NULL,
    "lastUsedAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL,
    "name" character varying(128) NOT NULL,
    "src" "public"."antenna_src_enum" NOT NULL,
    "userListId" character varying(32),
    "users" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "keywords" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "excludeKeywords" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "caseSensitive" boolean DEFAULT false NOT NULL,
    "excludeBots" boolean DEFAULT false NOT NULL,
    "withReplies" boolean DEFAULT false NOT NULL,
    "withFile" boolean NOT NULL,
    "expression" character varying(2048),
    "isActive" boolean DEFAULT true NOT NULL,
    "localOnly" boolean DEFAULT false NOT NULL,
    "excludeNotesInSensitiveChannel" boolean DEFAULT false NOT NULL,
    CONSTRAINT "CHK_ANTENNA_LIST_SRC_REQUIRES_USER_LIST" CHECK ((("src" <> 'list'::"public"."antenna_src_enum") OR ("userListId" IS NOT NULL)))
);

-- CONSTRAINT: antenna antenna_pkey
ALTER TABLE ONLY "public"."antenna"
    ADD CONSTRAINT "antenna_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ANTENNA_IS_ACTIVE
CREATE INDEX "IDX_ANTENNA_IS_ACTIVE" ON "public"."antenna" USING "btree" ("isActive");

-- INDEX: IDX_ANTENNA_LAST_USED_AT
CREATE INDEX "IDX_ANTENNA_LAST_USED_AT" ON "public"."antenna" USING "btree" ("lastUsedAt");

-- INDEX: IDX_ANTENNA_USER_ID
CREATE INDEX "IDX_ANTENNA_USER_ID" ON "public"."antenna" USING "btree" ("userId");

-- INDEX: IDX_ANTENNA_USER_LIST_ID
CREATE INDEX "IDX_ANTENNA_USER_LIST_ID" ON "public"."antenna" USING "btree" ("userListId");
--> statement-breakpoint
-- TABLE: avatar_decoration
CREATE TABLE "public"."avatar_decoration" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone,
    "url" character varying(1024) NOT NULL,
    "name" character varying(256) NOT NULL,
    "description" character varying(2048) NOT NULL,
    "roleIdsThatCanBeUsedThisDecoration" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "category" character varying(128)
);

-- CONSTRAINT: avatar_decoration avatar_decoration_pkey
ALTER TABLE ONLY "public"."avatar_decoration"
    ADD CONSTRAINT "avatar_decoration_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
-- TABLE: blocking
CREATE TABLE "public"."blocking" (
    "id" character varying(32) NOT NULL,
    "blockeeId" character varying(32) NOT NULL,
    "blockerId" character varying(32) NOT NULL
);

-- CONSTRAINT: blocking blocking_pkey
ALTER TABLE ONLY "public"."blocking"
    ADD CONSTRAINT "blocking_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_BLOCKING_BLOCKEE_ID
CREATE INDEX "IDX_BLOCKING_BLOCKEE_ID" ON "public"."blocking" USING "btree" ("blockeeId");

-- INDEX: IDX_BLOCKING_BLOCKER_ID
CREATE INDEX "IDX_BLOCKING_BLOCKER_ID" ON "public"."blocking" USING "btree" ("blockerId");

-- INDEX: IDX_BLOCKING_BLOCKER_ID_BLOCKEE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_BLOCKING_BLOCKER_ID_BLOCKEE_ID_UNIQUE" ON "public"."blocking" USING "btree" ("blockerId", "blockeeId");
--> statement-breakpoint
-- TABLE: cache_version
CREATE TABLE "public"."cache_version" (
    "key" character varying(64) NOT NULL,
    "version" integer DEFAULT 0 NOT NULL
);

-- CONSTRAINT: cache_version cache_version_pkey
ALTER TABLE ONLY "public"."cache_version"
    ADD CONSTRAINT "cache_version_pkey" PRIMARY KEY ("key");
--> statement-breakpoint
-- TABLE: channel
CREATE TABLE "public"."channel" (
    "id" character varying(32) NOT NULL,
    "lastNotedAt" timestamp with time zone,
    "userId" character varying(32),
    "name" character varying(128) NOT NULL,
    "description" character varying(2048),
    "bannerId" character varying(32),
    "pinnedNoteIds" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "color" character varying(16) DEFAULT '#86b300'::character varying NOT NULL,
    "isArchived" boolean DEFAULT false NOT NULL,
    "notesCount" integer DEFAULT 0 NOT NULL,
    "usersCount" integer DEFAULT 0 NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL,
    "allowRenoteToExternal" boolean DEFAULT true NOT NULL
);

-- CONSTRAINT: channel channel_pkey
ALTER TABLE ONLY "public"."channel"
    ADD CONSTRAINT "channel_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHANNEL_BANNER_ID
CREATE INDEX "IDX_CHANNEL_BANNER_ID" ON "public"."channel" USING "btree" ("bannerId");

-- INDEX: IDX_CHANNEL_IS_ARCHIVED
CREATE INDEX "IDX_CHANNEL_IS_ARCHIVED" ON "public"."channel" USING "btree" ("isArchived");

-- INDEX: IDX_CHANNEL_LAST_NOTED_AT
CREATE INDEX "IDX_CHANNEL_LAST_NOTED_AT" ON "public"."channel" USING "btree" ("lastNotedAt");

-- INDEX: IDX_CHANNEL_NOTES_COUNT
CREATE INDEX "IDX_CHANNEL_NOTES_COUNT" ON "public"."channel" USING "btree" ("notesCount");

-- INDEX: IDX_CHANNEL_USERS_COUNT
CREATE INDEX "IDX_CHANNEL_USERS_COUNT" ON "public"."channel" USING "btree" ("usersCount");

-- INDEX: IDX_CHANNEL_USER_ID
CREATE INDEX "IDX_CHANNEL_USER_ID" ON "public"."channel" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: channel_favorite
CREATE TABLE "public"."channel_favorite" (
    "id" character varying(32) NOT NULL,
    "channelId" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL
);

-- CONSTRAINT: channel_favorite channel_favorite_pkey
ALTER TABLE ONLY "public"."channel_favorite"
    ADD CONSTRAINT "channel_favorite_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHANNEL_FAVORITE_CHANNEL_ID
CREATE INDEX "IDX_CHANNEL_FAVORITE_CHANNEL_ID" ON "public"."channel_favorite" USING "btree" ("channelId");

-- INDEX: IDX_CHANNEL_FAVORITE_USER_ID
CREATE INDEX "IDX_CHANNEL_FAVORITE_USER_ID" ON "public"."channel_favorite" USING "btree" ("userId");

-- INDEX: IDX_CHANNEL_FAVORITE_USER_ID_CHANNEL_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CHANNEL_FAVORITE_USER_ID_CHANNEL_ID_UNIQUE" ON "public"."channel_favorite" USING "btree" ("userId", "channelId");
--> statement-breakpoint
-- TABLE: channel_following
CREATE TABLE "public"."channel_following" (
    "id" character varying(32) NOT NULL,
    "followeeId" character varying(32) NOT NULL,
    "followerId" character varying(32) NOT NULL
);

-- CONSTRAINT: channel_following channel_following_pkey
ALTER TABLE ONLY "public"."channel_following"
    ADD CONSTRAINT "channel_following_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHANNEL_FOLLOWING_FOLLOWEE_ID
CREATE INDEX "IDX_CHANNEL_FOLLOWING_FOLLOWEE_ID" ON "public"."channel_following" USING "btree" ("followeeId");

-- INDEX: IDX_CHANNEL_FOLLOWING_FOLLOWER_ID
CREATE INDEX "IDX_CHANNEL_FOLLOWING_FOLLOWER_ID" ON "public"."channel_following" USING "btree" ("followerId");

-- INDEX: IDX_CHANNEL_FOLLOWING_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CHANNEL_FOLLOWING_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE" ON "public"."channel_following" USING "btree" ("followerId", "followeeId");
--> statement-breakpoint
-- TABLE: channel_muting
CREATE TABLE "public"."channel_muting" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "channelId" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone
);

-- CONSTRAINT: channel_muting channel_muting_pkey
ALTER TABLE ONLY "public"."channel_muting"
    ADD CONSTRAINT "channel_muting_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHANNEL_MUTING_CHANNEL_ID
CREATE INDEX "IDX_CHANNEL_MUTING_CHANNEL_ID" ON "public"."channel_muting" USING "btree" ("channelId");

-- INDEX: IDX_CHANNEL_MUTING_EXPIRES_AT
CREATE INDEX "IDX_CHANNEL_MUTING_EXPIRES_AT" ON "public"."channel_muting" USING "btree" ("expiresAt");

-- INDEX: IDX_CHANNEL_MUTING_USER_ID
CREATE INDEX "IDX_CHANNEL_MUTING_USER_ID" ON "public"."channel_muting" USING "btree" ("userId");

-- INDEX: IDX_CHANNEL_MUTING_USER_ID_CHANNEL_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CHANNEL_MUTING_USER_ID_CHANNEL_ID_UNIQUE" ON "public"."channel_muting" USING "btree" ("userId", "channelId");
--> statement-breakpoint
-- TABLE: chat_approval
CREATE TABLE "public"."chat_approval" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "otherId" character varying(32) NOT NULL
);

-- CONSTRAINT: chat_approval chat_approval_pkey
ALTER TABLE ONLY "public"."chat_approval"
    ADD CONSTRAINT "chat_approval_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHAT_APPROVAL_OTHER_ID
CREATE INDEX "IDX_CHAT_APPROVAL_OTHER_ID" ON "public"."chat_approval" USING "btree" ("otherId");

-- INDEX: IDX_CHAT_APPROVAL_USER_ID
CREATE INDEX "IDX_CHAT_APPROVAL_USER_ID" ON "public"."chat_approval" USING "btree" ("userId");

-- INDEX: IDX_CHAT_APPROVAL_USER_ID_OTHER_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CHAT_APPROVAL_USER_ID_OTHER_ID_UNIQUE" ON "public"."chat_approval" USING "btree" ("userId", "otherId");
--> statement-breakpoint
-- TABLE: chat_message
CREATE TABLE "public"."chat_message" (
    "id" character varying(32) NOT NULL,
    "fromUserId" character varying(32) NOT NULL,
    "toUserId" character varying(32),
    "toRoomId" character varying(32),
    "text" character varying(4096),
    "uri" character varying(512),
    "reads" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "fileId" character varying(32),
    "reactions" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL
);

-- CONSTRAINT: chat_message chat_message_pkey
ALTER TABLE ONLY "public"."chat_message"
    ADD CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHAT_MESSAGE_FILE_ID
CREATE INDEX "IDX_CHAT_MESSAGE_FILE_ID" ON "public"."chat_message" USING "btree" ("fileId");

-- INDEX: IDX_CHAT_MESSAGE_FROM_USER_ID
CREATE INDEX "IDX_CHAT_MESSAGE_FROM_USER_ID" ON "public"."chat_message" USING "btree" ("fromUserId");

-- INDEX: IDX_CHAT_MESSAGE_TO_ROOM_ID
CREATE INDEX "IDX_CHAT_MESSAGE_TO_ROOM_ID" ON "public"."chat_message" USING "btree" ("toRoomId");

-- INDEX: IDX_CHAT_MESSAGE_TO_USER_ID
CREATE INDEX "IDX_CHAT_MESSAGE_TO_USER_ID" ON "public"."chat_message" USING "btree" ("toUserId");
--> statement-breakpoint
-- TABLE: chat_room
CREATE TABLE "public"."chat_room" (
    "id" character varying(32) NOT NULL,
    "name" character varying(256) NOT NULL,
    "ownerId" character varying(32) NOT NULL,
    "description" character varying(2048) DEFAULT ''::character varying NOT NULL,
    "isArchived" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: chat_room chat_room_pkey
ALTER TABLE ONLY "public"."chat_room"
    ADD CONSTRAINT "chat_room_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHAT_ROOM_OWNER_ID
CREATE INDEX "IDX_CHAT_ROOM_OWNER_ID" ON "public"."chat_room" USING "btree" ("ownerId");
--> statement-breakpoint
-- TABLE: chat_room_invitation
CREATE TABLE "public"."chat_room_invitation" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "roomId" character varying(32) NOT NULL,
    "ignored" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: chat_room_invitation chat_room_invitation_pkey
ALTER TABLE ONLY "public"."chat_room_invitation"
    ADD CONSTRAINT "chat_room_invitation_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHAT_ROOM_INVITATION_ROOM_ID
CREATE INDEX "IDX_CHAT_ROOM_INVITATION_ROOM_ID" ON "public"."chat_room_invitation" USING "btree" ("roomId");

-- INDEX: IDX_CHAT_ROOM_INVITATION_USER_ID
CREATE INDEX "IDX_CHAT_ROOM_INVITATION_USER_ID" ON "public"."chat_room_invitation" USING "btree" ("userId");

-- INDEX: IDX_CHAT_ROOM_INVITATION_USER_ID_ROOM_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CHAT_ROOM_INVITATION_USER_ID_ROOM_ID_UNIQUE" ON "public"."chat_room_invitation" USING "btree" ("userId", "roomId");
--> statement-breakpoint
-- TABLE: chat_room_membership
CREATE TABLE "public"."chat_room_membership" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "roomId" character varying(32) NOT NULL,
    "isMuted" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: chat_room_membership chat_room_membership_pkey
ALTER TABLE ONLY "public"."chat_room_membership"
    ADD CONSTRAINT "chat_room_membership_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHAT_ROOM_MEMBERSHIP_ROOM_ID
CREATE INDEX "IDX_CHAT_ROOM_MEMBERSHIP_ROOM_ID" ON "public"."chat_room_membership" USING "btree" ("roomId");

-- INDEX: IDX_CHAT_ROOM_MEMBERSHIP_USER_ID
CREATE INDEX "IDX_CHAT_ROOM_MEMBERSHIP_USER_ID" ON "public"."chat_room_membership" USING "btree" ("userId");

-- INDEX: IDX_CHAT_ROOM_MEMBERSHIP_USER_ID_ROOM_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CHAT_ROOM_MEMBERSHIP_USER_ID_ROOM_ID_UNIQUE" ON "public"."chat_room_membership" USING "btree" ("userId", "roomId");
--> statement-breakpoint
-- TABLE: clip
CREATE TABLE "public"."clip" (
    "id" character varying(32) NOT NULL,
    "lastClippedAt" timestamp with time zone,
    "userId" character varying(32) NOT NULL,
    "name" character varying(128) NOT NULL,
    "isPublic" boolean DEFAULT false NOT NULL,
    "description" character varying(2048)
);

-- CONSTRAINT: clip clip_pkey
ALTER TABLE ONLY "public"."clip"
    ADD CONSTRAINT "clip_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CLIP_LAST_CLIPPED_AT
CREATE INDEX "IDX_CLIP_LAST_CLIPPED_AT" ON "public"."clip" USING "btree" ("lastClippedAt");

-- INDEX: IDX_CLIP_USER_ID
CREATE INDEX "IDX_CLIP_USER_ID" ON "public"."clip" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: clip_favorite
CREATE TABLE "public"."clip_favorite" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "clipId" character varying(32) NOT NULL
);

-- CONSTRAINT: clip_favorite clip_favorite_pkey
ALTER TABLE ONLY "public"."clip_favorite"
    ADD CONSTRAINT "clip_favorite_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CLIP_FAVORITE_CLIP_ID
CREATE INDEX "IDX_CLIP_FAVORITE_CLIP_ID" ON "public"."clip_favorite" USING "btree" ("clipId");

-- INDEX: IDX_CLIP_FAVORITE_USER_ID
CREATE INDEX "IDX_CLIP_FAVORITE_USER_ID" ON "public"."clip_favorite" USING "btree" ("userId");

-- INDEX: IDX_CLIP_FAVORITE_USER_ID_CLIP_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CLIP_FAVORITE_USER_ID_CLIP_ID_UNIQUE" ON "public"."clip_favorite" USING "btree" ("userId", "clipId");
--> statement-breakpoint
-- TABLE: clip_note
CREATE TABLE "public"."clip_note" (
    "id" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    "clipId" character varying(32) NOT NULL
);

-- CONSTRAINT: clip_note clip_note_pkey
ALTER TABLE ONLY "public"."clip_note"
    ADD CONSTRAINT "clip_note_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CLIP_NOTE_CLIP_ID
CREATE INDEX "IDX_CLIP_NOTE_CLIP_ID" ON "public"."clip_note" USING "btree" ("clipId");

-- INDEX: IDX_CLIP_NOTE_NOTE_ID
CREATE INDEX "IDX_CLIP_NOTE_NOTE_ID" ON "public"."clip_note" USING "btree" ("noteId");

-- INDEX: IDX_CLIP_NOTE_NOTE_ID_CLIP_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CLIP_NOTE_NOTE_ID_CLIP_ID_UNIQUE" ON "public"."clip_note" USING "btree" ("noteId", "clipId");
--> statement-breakpoint
-- TABLE: drive_file
CREATE TABLE "public"."drive_file" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32),
    "userHost" character varying(128),
    "md5" character varying(32),
    "name" character varying(256) NOT NULL,
    "type" character varying(128) NOT NULL,
    "size" integer NOT NULL,
    "comment" character varying(512),
    "blurhash" character varying(128),
    "properties" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "storedInternal" boolean NOT NULL,
    "url" character varying(1024) NOT NULL,
    "thumbnailUrl" character varying(512),
    "webpublicUrl" character varying(512),
    "webpublicType" character varying(128),
    "accessKey" character varying(256),
    "thumbnailAccessKey" character varying(256),
    "webpublicAccessKey" character varying(256),
    "uri" character varying(1024),
    "src" character varying(1024),
    "folderId" character varying(32),
    "isSensitive" boolean DEFAULT false NOT NULL,
    "maybeSensitive" boolean DEFAULT false NOT NULL,
    "maybePorn" boolean DEFAULT false NOT NULL,
    "isLink" boolean DEFAULT false NOT NULL,
    "requestHeaders" "jsonb" DEFAULT '{}'::"jsonb",
    "requestIp" character varying(128)
);

-- CONSTRAINT: drive_file drive_file_pkey
ALTER TABLE ONLY "public"."drive_file"
    ADD CONSTRAINT "drive_file_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_DRIVE_FILE_ACCESS_KEY_UNIQUE
CREATE UNIQUE INDEX "IDX_DRIVE_FILE_ACCESS_KEY_UNIQUE" ON "public"."drive_file" USING "btree" ("accessKey");

-- INDEX: IDX_DRIVE_FILE_FOLDER_ID
CREATE INDEX "IDX_DRIVE_FILE_FOLDER_ID" ON "public"."drive_file" USING "btree" ("folderId");

-- INDEX: IDX_DRIVE_FILE_IS_LINK
CREATE INDEX "IDX_DRIVE_FILE_IS_LINK" ON "public"."drive_file" USING "btree" ("isLink");

-- INDEX: IDX_DRIVE_FILE_IS_SENSITIVE
CREATE INDEX "IDX_DRIVE_FILE_IS_SENSITIVE" ON "public"."drive_file" USING "btree" ("isSensitive");

-- INDEX: IDX_DRIVE_FILE_MAYBE_PORN
CREATE INDEX "IDX_DRIVE_FILE_MAYBE_PORN" ON "public"."drive_file" USING "btree" ("maybePorn");

-- INDEX: IDX_DRIVE_FILE_MAYBE_SENSITIVE
CREATE INDEX "IDX_DRIVE_FILE_MAYBE_SENSITIVE" ON "public"."drive_file" USING "btree" ("maybeSensitive");

-- INDEX: IDX_DRIVE_FILE_MD5
CREATE INDEX "IDX_DRIVE_FILE_MD5" ON "public"."drive_file" USING "btree" ("md5");

-- INDEX: IDX_DRIVE_FILE_THUMBNAIL_ACCESS_KEY_UNIQUE
CREATE UNIQUE INDEX "IDX_DRIVE_FILE_THUMBNAIL_ACCESS_KEY_UNIQUE" ON "public"."drive_file" USING "btree" ("thumbnailAccessKey");

-- INDEX: IDX_DRIVE_FILE_TYPE
CREATE INDEX "IDX_DRIVE_FILE_TYPE" ON "public"."drive_file" USING "btree" ("type");

-- INDEX: IDX_DRIVE_FILE_URI
CREATE INDEX "IDX_DRIVE_FILE_URI" ON "public"."drive_file" USING "btree" ("uri");

-- INDEX: IDX_DRIVE_FILE_USER_HOST
CREATE INDEX "IDX_DRIVE_FILE_USER_HOST" ON "public"."drive_file" USING "btree" ("userHost");

-- INDEX: IDX_DRIVE_FILE_USER_ID
CREATE INDEX "IDX_DRIVE_FILE_USER_ID" ON "public"."drive_file" USING "btree" ("userId");

-- INDEX: IDX_DRIVE_FILE_USER_ID_FOLDER_ID_ID
CREATE INDEX "IDX_DRIVE_FILE_USER_ID_FOLDER_ID_ID" ON "public"."drive_file" USING "btree" ("userId", "folderId", "id");

-- INDEX: IDX_DRIVE_FILE_USER_ID_SIZE
CREATE INDEX "IDX_DRIVE_FILE_USER_ID_SIZE" ON "public"."drive_file" USING "btree" ("userId") INCLUDE ("size") WHERE ("isLink" = false);

-- INDEX: IDX_DRIVE_FILE_WEBPUBLIC_ACCESS_KEY_UNIQUE
CREATE UNIQUE INDEX "IDX_DRIVE_FILE_WEBPUBLIC_ACCESS_KEY_UNIQUE" ON "public"."drive_file" USING "btree" ("webpublicAccessKey");
--> statement-breakpoint
-- TABLE: drive_folder
CREATE TABLE "public"."drive_folder" (
    "id" character varying(32) NOT NULL,
    "name" character varying(128) NOT NULL,
    "userId" character varying(32),
    "parentId" character varying(32)
);

-- CONSTRAINT: drive_folder drive_folder_pkey
ALTER TABLE ONLY "public"."drive_folder"
    ADD CONSTRAINT "drive_folder_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_DRIVE_FOLDER_PARENT_ID
CREATE INDEX "IDX_DRIVE_FOLDER_PARENT_ID" ON "public"."drive_folder" USING "btree" ("parentId");

-- INDEX: IDX_DRIVE_FOLDER_USER_ID
CREATE INDEX "IDX_DRIVE_FOLDER_USER_ID" ON "public"."drive_folder" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: emoji
CREATE TABLE "public"."emoji" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone,
    "name" character varying(128) NOT NULL,
    "host" character varying(128),
    "category" character varying(128),
    "originalUrl" character varying(512) NOT NULL,
    "publicUrl" character varying(512) DEFAULT ''::character varying NOT NULL,
    "uri" character varying(512),
    "type" character varying(64),
    "aliases" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "license" character varying(1024),
    "localOnly" boolean DEFAULT false NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL,
    "roleIdsThatCanBeUsedThisEmojiAsReaction" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL
);

-- CONSTRAINT: emoji emoji_pkey
ALTER TABLE ONLY "public"."emoji"
    ADD CONSTRAINT "emoji_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_EMOJI_CATEGORY
CREATE INDEX "IDX_EMOJI_CATEGORY" ON "public"."emoji" USING "btree" ("category");

-- INDEX: IDX_EMOJI_HOST
CREATE INDEX "IDX_EMOJI_HOST" ON "public"."emoji" USING "btree" ("host");

-- INDEX: IDX_EMOJI_NAME
CREATE INDEX "IDX_EMOJI_NAME" ON "public"."emoji" USING "btree" ("name");

-- INDEX: IDX_EMOJI_NAME_HOST_UNIQUE
CREATE UNIQUE INDEX "IDX_EMOJI_NAME_HOST_UNIQUE" ON "public"."emoji" USING "btree" ("name", "host");

-- INDEX: IDX_EMOJI_ROLE_IDS
CREATE INDEX "IDX_EMOJI_ROLE_IDS" ON "public"."emoji" USING "gin" ("roleIdsThatCanBeUsedThisEmojiAsReaction");
--> statement-breakpoint
-- TABLE: flash
CREATE TABLE "public"."flash" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "title" character varying(256) NOT NULL,
    "summary" character varying(1024) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "script" character varying(65536) NOT NULL,
    "permissions" character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    "likedCount" integer DEFAULT 0 NOT NULL,
    "visibility" character varying(512) DEFAULT 'public'::character varying NOT NULL
);

-- CONSTRAINT: flash flash_pkey
ALTER TABLE ONLY "public"."flash"
    ADD CONSTRAINT "flash_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_FLASH_UPDATED_AT
CREATE INDEX "IDX_FLASH_UPDATED_AT" ON "public"."flash" USING "btree" ("updatedAt");

-- INDEX: IDX_FLASH_USER_ID
CREATE INDEX "IDX_FLASH_USER_ID" ON "public"."flash" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: flash_like
CREATE TABLE "public"."flash_like" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "flashId" character varying(32) NOT NULL
);

-- CONSTRAINT: flash_like flash_like_pkey
ALTER TABLE ONLY "public"."flash_like"
    ADD CONSTRAINT "flash_like_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_FLASH_LIKE_FLASH_ID
CREATE INDEX "IDX_FLASH_LIKE_FLASH_ID" ON "public"."flash_like" USING "btree" ("flashId");

-- INDEX: IDX_FLASH_LIKE_USER_ID
CREATE INDEX "IDX_FLASH_LIKE_USER_ID" ON "public"."flash_like" USING "btree" ("userId");

-- INDEX: IDX_FLASH_LIKE_USER_ID_FLASH_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_FLASH_LIKE_USER_ID_FLASH_ID_UNIQUE" ON "public"."flash_like" USING "btree" ("userId", "flashId");
--> statement-breakpoint
-- TABLE: follow_acceptance
CREATE TABLE "public"."follow_acceptance" (
    "id" character varying(64) NOT NULL,
    "actorUri" "text" NOT NULL,
    "followeeId" character varying(32) NOT NULL,
    "requestId" "text",
    "followingId" character varying(32) NOT NULL
);

-- CONSTRAINT: follow_acceptance follow_acceptance_pkey
ALTER TABLE ONLY "public"."follow_acceptance"
    ADD CONSTRAINT "follow_acceptance_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_FOLLOW_ACCEPTANCE_FOLLOWEE_ID
CREATE INDEX "IDX_FOLLOW_ACCEPTANCE_FOLLOWEE_ID" ON "public"."follow_acceptance" USING "btree" ("followeeId");
--> statement-breakpoint
-- TABLE: follow_request
CREATE TABLE "public"."follow_request" (
    "id" character varying(32) NOT NULL,
    "followeeId" character varying(32) NOT NULL,
    "followerId" character varying(32) NOT NULL,
    "requestId" character varying(128),
    "withReplies" boolean DEFAULT false NOT NULL,
    "followerHost" character varying(128),
    "followerInbox" character varying(512),
    "followerSharedInbox" character varying(512),
    "followeeHost" character varying(128),
    "followeeInbox" character varying(512),
    "followeeSharedInbox" character varying(512)
);

-- CONSTRAINT: follow_request follow_request_pkey
ALTER TABLE ONLY "public"."follow_request"
    ADD CONSTRAINT "follow_request_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_FOLLOW_REQUEST_FOLLOWEE_ID
CREATE INDEX "IDX_FOLLOW_REQUEST_FOLLOWEE_ID" ON "public"."follow_request" USING "btree" ("followeeId");

-- INDEX: IDX_FOLLOW_REQUEST_FOLLOWER_ID
CREATE INDEX "IDX_FOLLOW_REQUEST_FOLLOWER_ID" ON "public"."follow_request" USING "btree" ("followerId");

-- INDEX: IDX_FOLLOW_REQUEST_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_FOLLOW_REQUEST_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE" ON "public"."follow_request" USING "btree" ("followerId", "followeeId");
--> statement-breakpoint
-- TABLE: following
CREATE TABLE "public"."following" (
    "id" character varying(32) NOT NULL,
    "followeeId" character varying(32) NOT NULL,
    "followerId" character varying(32) NOT NULL,
    "isFollowerHibernated" boolean DEFAULT false NOT NULL,
    "withReplies" boolean DEFAULT false NOT NULL,
    "notify" character varying(32),
    "followerHost" character varying(128),
    "followerInbox" character varying(512),
    "followerSharedInbox" character varying(512),
    "followeeHost" character varying(128),
    "followeeInbox" character varying(512),
    "followeeSharedInbox" character varying(512)
);

-- CONSTRAINT: following following_pkey
ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_FOLLOWING_FOLLOWEE_HOST
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_HOST" ON "public"."following" USING "btree" ("followeeHost");

-- INDEX: IDX_FOLLOWING_FOLLOWEE_ID
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_ID" ON "public"."following" USING "btree" ("followeeId");

-- INDEX: IDX_FOLLOWING_FOLLOWEE_ID_FOLLOWER_HOST_IS_FOLLOWER_HIBERNATED
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_ID_FOLLOWER_HOST_IS_FOLLOWER_HIBERNATED" ON "public"."following" USING "btree" ("followeeId", "followerHost", "isFollowerHibernated");

-- INDEX: IDX_FOLLOWING_FOLLOWEE_ID_ID
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_ID_ID" ON "public"."following" USING "btree" ("followeeId", "id");

-- INDEX: IDX_FOLLOWING_FOLLOWER_HOST
CREATE INDEX "IDX_FOLLOWING_FOLLOWER_HOST" ON "public"."following" USING "btree" ("followerHost");

-- INDEX: IDX_FOLLOWING_FOLLOWER_ID
CREATE INDEX "IDX_FOLLOWING_FOLLOWER_ID" ON "public"."following" USING "btree" ("followerId");

-- INDEX: IDX_FOLLOWING_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_FOLLOWING_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE" ON "public"."following" USING "btree" ("followerId", "followeeId");

-- INDEX: IDX_FOLLOWING_FOLLOWER_ID_ID
CREATE INDEX "IDX_FOLLOWING_FOLLOWER_ID_ID" ON "public"."following" USING "btree" ("followerId", "id");

-- INDEX: IDX_FOLLOWING_NOTIFY
CREATE INDEX "IDX_FOLLOWING_NOTIFY" ON "public"."following" USING "btree" ("notify");
--> statement-breakpoint
-- TABLE: gallery_like
CREATE TABLE "public"."gallery_like" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "postId" character varying(32) NOT NULL
);

-- CONSTRAINT: gallery_like gallery_like_pkey
ALTER TABLE ONLY "public"."gallery_like"
    ADD CONSTRAINT "gallery_like_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_GALLERY_LIKE_POST_ID
CREATE INDEX "IDX_GALLERY_LIKE_POST_ID" ON "public"."gallery_like" USING "btree" ("postId");

-- INDEX: IDX_GALLERY_LIKE_USER_ID
CREATE INDEX "IDX_GALLERY_LIKE_USER_ID" ON "public"."gallery_like" USING "btree" ("userId");

-- INDEX: IDX_GALLERY_LIKE_USER_ID_POST_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_GALLERY_LIKE_USER_ID_POST_ID_UNIQUE" ON "public"."gallery_like" USING "btree" ("userId", "postId");
--> statement-breakpoint
-- TABLE: gallery_post
CREATE TABLE "public"."gallery_post" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "title" character varying(256) NOT NULL,
    "description" character varying(2048),
    "userId" character varying(32) NOT NULL,
    "fileIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL,
    "likedCount" integer DEFAULT 0 NOT NULL,
    "tags" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL
);

-- CONSTRAINT: gallery_post gallery_post_pkey
ALTER TABLE ONLY "public"."gallery_post"
    ADD CONSTRAINT "gallery_post_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_GALLERY_POST_FILE_IDS
CREATE INDEX "IDX_GALLERY_POST_FILE_IDS" ON "public"."gallery_post" USING "btree" ("fileIds");

-- INDEX: IDX_GALLERY_POST_IS_SENSITIVE
CREATE INDEX "IDX_GALLERY_POST_IS_SENSITIVE" ON "public"."gallery_post" USING "btree" ("isSensitive");

-- INDEX: IDX_GALLERY_POST_LIKED_COUNT
CREATE INDEX "IDX_GALLERY_POST_LIKED_COUNT" ON "public"."gallery_post" USING "btree" ("likedCount");

-- INDEX: IDX_GALLERY_POST_TAGS
CREATE INDEX "IDX_GALLERY_POST_TAGS" ON "public"."gallery_post" USING "btree" ("tags");

-- INDEX: IDX_GALLERY_POST_UPDATED_AT
CREATE INDEX "IDX_GALLERY_POST_UPDATED_AT" ON "public"."gallery_post" USING "btree" ("updatedAt");

-- INDEX: IDX_GALLERY_POST_USER_ID
CREATE INDEX "IDX_GALLERY_POST_USER_ID" ON "public"."gallery_post" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: hashtag
CREATE TABLE "public"."hashtag" (
    "id" character varying(32) NOT NULL,
    "name" character varying(128) NOT NULL,
    "mentionedUsersCount" integer DEFAULT 0 NOT NULL,
    "mentionedLocalUsersCount" integer DEFAULT 0 NOT NULL,
    "mentionedRemoteUsersCount" integer DEFAULT 0 NOT NULL,
    "attachedUsersCount" integer DEFAULT 0 NOT NULL,
    "attachedLocalUsersCount" integer DEFAULT 0 NOT NULL,
    "attachedRemoteUsersCount" integer DEFAULT 0 NOT NULL
);

-- CONSTRAINT: hashtag hashtag_pkey
ALTER TABLE ONLY "public"."hashtag"
    ADD CONSTRAINT "hashtag_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_HASHTAG_ATTACHED_LOCAL_USERS_COUNT
CREATE INDEX "IDX_HASHTAG_ATTACHED_LOCAL_USERS_COUNT" ON "public"."hashtag" USING "btree" ("attachedLocalUsersCount");

-- INDEX: IDX_HASHTAG_ATTACHED_REMOTE_USERS_COUNT
CREATE INDEX "IDX_HASHTAG_ATTACHED_REMOTE_USERS_COUNT" ON "public"."hashtag" USING "btree" ("attachedRemoteUsersCount");

-- INDEX: IDX_HASHTAG_ATTACHED_USERS_COUNT
CREATE INDEX "IDX_HASHTAG_ATTACHED_USERS_COUNT" ON "public"."hashtag" USING "btree" ("attachedUsersCount");

-- INDEX: IDX_HASHTAG_MENTIONED_LOCAL_USERS_COUNT
CREATE INDEX "IDX_HASHTAG_MENTIONED_LOCAL_USERS_COUNT" ON "public"."hashtag" USING "btree" ("mentionedLocalUsersCount");

-- INDEX: IDX_HASHTAG_MENTIONED_REMOTE_USERS_COUNT
CREATE INDEX "IDX_HASHTAG_MENTIONED_REMOTE_USERS_COUNT" ON "public"."hashtag" USING "btree" ("mentionedRemoteUsersCount");

-- INDEX: IDX_HASHTAG_MENTIONED_USERS_COUNT
CREATE INDEX "IDX_HASHTAG_MENTIONED_USERS_COUNT" ON "public"."hashtag" USING "btree" ("mentionedUsersCount");

-- INDEX: IDX_HASHTAG_NAME_UNIQUE
CREATE UNIQUE INDEX "IDX_HASHTAG_NAME_UNIQUE" ON "public"."hashtag" USING "btree" ("name");
--> statement-breakpoint
-- TABLE: hashtag_user
CREATE TABLE "public"."hashtag_user" (
    "hashtagId" character varying(32) NOT NULL,
    "attached" boolean NOT NULL,
    "userId" character varying(32) NOT NULL
);

-- CONSTRAINT: hashtag_user PK_HASHTAG_USER
ALTER TABLE ONLY "public"."hashtag_user"
    ADD CONSTRAINT "PK_HASHTAG_USER" PRIMARY KEY ("hashtagId", "attached", "userId");

-- INDEX: IDX_HASHTAG_USER_USER_ID
CREATE INDEX "IDX_HASHTAG_USER_USER_ID" ON "public"."hashtag_user" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: instance
CREATE TABLE "public"."instance" (
    "id" character varying(32) NOT NULL,
    "firstRetrievedAt" timestamp with time zone NOT NULL,
    "host" character varying(128) NOT NULL,
    "usersCount" integer DEFAULT 0 NOT NULL,
    "notesCount" integer DEFAULT 0 NOT NULL,
    "followingCount" integer DEFAULT 0 NOT NULL,
    "followersCount" integer DEFAULT 0 NOT NULL,
    "latestRequestReceivedAt" timestamp with time zone,
    "isNotResponding" boolean DEFAULT false NOT NULL,
    "notRespondingSince" timestamp with time zone,
    "suspensionState" "public"."instance_suspensionstate_enum" DEFAULT 'none'::"public"."instance_suspensionstate_enum" NOT NULL,
    "softwareName" character varying(64),
    "softwareVersion" character varying(64),
    "openRegistrations" boolean,
    "name" character varying(256),
    "description" character varying(4096),
    "maintainerName" character varying(128),
    "maintainerEmail" character varying(256),
    "iconUrl" character varying(256),
    "faviconUrl" character varying(256),
    "themeColor" character varying(64),
    "infoUpdatedAt" timestamp with time zone,
    "moderationNote" character varying(16384) DEFAULT ''::character varying NOT NULL
);

-- CONSTRAINT: instance instance_pkey
ALTER TABLE ONLY "public"."instance"
    ADD CONSTRAINT "instance_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_INSTANCE_FIRST_RETRIEVED_AT
CREATE INDEX "IDX_INSTANCE_FIRST_RETRIEVED_AT" ON "public"."instance" USING "btree" ("firstRetrievedAt");

-- INDEX: IDX_INSTANCE_HOST_UNIQUE
CREATE UNIQUE INDEX "IDX_INSTANCE_HOST_UNIQUE" ON "public"."instance" USING "btree" ("host");

-- INDEX: IDX_INSTANCE_SUSPENSION_STATE
CREATE INDEX "IDX_INSTANCE_SUSPENSION_STATE" ON "public"."instance" USING "btree" ("suspensionState");
--> statement-breakpoint
-- TABLE: meta
CREATE TABLE "public"."meta" (
    "id" character varying(32) NOT NULL,
    "rootUserId" character varying(32),
    "name" character varying(1024),
    "shortName" character varying(64),
    "description" character varying(1024),
    "maintainerName" character varying(1024),
    "maintainerEmail" character varying(1024),
    "disableRegistration" boolean DEFAULT true NOT NULL,
    "langs" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "pinnedUsers" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "hiddenTags" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "blockedHosts" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "sensitiveWords" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "prohibitedWords" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "prohibitedWordsForNameOfUser" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "silencedHosts" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "mediaSilencedHosts" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "themeColor" character varying(1024),
    "mascotImageUrl" character varying(1024),
    "bannerUrl" character varying(1024),
    "backgroundImageUrl" character varying(1024),
    "logoImageUrl" character varying(1024),
    "iconUrl" character varying(1024),
    "app192IconUrl" character varying(1024),
    "app512IconUrl" character varying(1024),
    "serverErrorImageUrl" character varying(1024),
    "notFoundImageUrl" character varying(1024),
    "infoImageUrl" character varying(1024),
    "cacheRemoteFiles" boolean DEFAULT false NOT NULL,
    "cacheRemoteSensitiveFiles" boolean DEFAULT true NOT NULL,
    "emailRequiredForSignup" boolean DEFAULT false NOT NULL,
    "enableHcaptcha" boolean DEFAULT false NOT NULL,
    "hcaptchaSiteKey" character varying(1024),
    "hcaptchaSecretKey" character varying(1024),
    "enableCap" boolean DEFAULT false CONSTRAINT "meta_enableMcaptcha_not_null" NOT NULL,
    "enableRecaptcha" boolean DEFAULT false NOT NULL,
    "recaptchaSiteKey" character varying(1024),
    "recaptchaSecretKey" character varying(1024),
    "enableTurnstile" boolean DEFAULT false NOT NULL,
    "turnstileSiteKey" character varying(1024),
    "turnstileSecretKey" character varying(1024),
    "enableTestcaptcha" boolean DEFAULT false NOT NULL,
    "sensitiveMediaDetection" "public"."meta_sensitivemediadetection_enum" DEFAULT 'none'::"public"."meta_sensitivemediadetection_enum" NOT NULL,
    "sensitiveMediaDetectionSensitivity" "public"."meta_sensitivemediadetectionsensitivity_enum" DEFAULT 'medium'::"public"."meta_sensitivemediadetectionsensitivity_enum" NOT NULL,
    "setSensitiveFlagAutomatically" boolean DEFAULT false NOT NULL,
    "enableSensitiveMediaDetectionForVideos" boolean DEFAULT false NOT NULL,
    "sensitiveMediaDetectionApiUrl" character varying(1024),
    "sensitiveMediaDetectionApiKey" character varying(1024),
    "sensitiveMediaDetectionTimeout" integer DEFAULT 60000 NOT NULL,
    "sensitiveMediaDetectionMaxImagesPerRequest" integer DEFAULT 4 NOT NULL,
    "enableEmail" boolean DEFAULT false NOT NULL,
    "email" character varying(1024),
    "smtpSecure" boolean DEFAULT false NOT NULL,
    "smtpHost" character varying(1024),
    "smtpPort" integer,
    "smtpUser" character varying(1024),
    "smtpPass" character varying(1024),
    "enableServiceWorker" boolean DEFAULT false NOT NULL,
    "swPublicKey" character varying(1024),
    "swPrivateKey" character varying(1024),
    "deeplAuthKey" character varying(1024),
    "deeplIsPro" boolean DEFAULT false NOT NULL,
    "termsOfServiceUrl" character varying(1024),
    "repositoryUrl" character varying(1024) DEFAULT 'https://github.com/haru0416-dev/misskey'::character varying,
    "feedbackUrl" character varying(1024) DEFAULT 'https://github.com/haru0416-dev/misskey/issues/new'::character varying,
    "impressumUrl" character varying(1024),
    "privacyPolicyUrl" character varying(1024),
    "inquiryUrl" character varying(1024),
    "defaultLightTheme" character varying(8192),
    "defaultDarkTheme" character varying(8192),
    "useObjectStorage" boolean DEFAULT false NOT NULL,
    "objectStorageBucket" character varying(1024),
    "objectStoragePrefix" character varying(1024),
    "objectStorageBaseUrl" character varying(1024),
    "objectStorageEndpoint" character varying(1024),
    "objectStorageRegion" character varying(1024),
    "objectStorageAccessKey" character varying(1024),
    "objectStorageSecretKey" character varying(1024),
    "objectStoragePort" integer,
    "objectStorageUseSSL" boolean DEFAULT true NOT NULL,
    "objectStorageUseProxy" boolean DEFAULT true NOT NULL,
    "objectStorageSetPublicRead" boolean DEFAULT false NOT NULL,
    "objectStorageS3ForcePathStyle" boolean DEFAULT true NOT NULL,
    "enableIpLogging" boolean DEFAULT false NOT NULL,
    "enableActiveEmailValidation" boolean DEFAULT true NOT NULL,
    "enableVerifymailApi" boolean DEFAULT false NOT NULL,
    "verifymailAuthKey" character varying(1024),
    "enableTruemailApi" boolean DEFAULT false NOT NULL,
    "truemailInstance" character varying(1024),
    "truemailAuthKey" character varying(1024),
    "enableChartsForRemoteUser" boolean DEFAULT true NOT NULL,
    "enableChartsForFederatedInstances" boolean DEFAULT true NOT NULL,
    "enableStatsForFederatedInstances" boolean DEFAULT true NOT NULL,
    "enableServerMachineStats" boolean DEFAULT false NOT NULL,
    "enableIdenticonGeneration" boolean DEFAULT true NOT NULL,
    "policies" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "serverRules" character varying(280)[] DEFAULT '{}'::character varying[] NOT NULL,
    "manifestJsonOverride" character varying(8192) DEFAULT '{}'::character varying NOT NULL,
    "bannedEmailDomains" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "preservedUsernames" character varying(1024)[] DEFAULT '{admin,administrator,root,system,maintainer,host,mod,moderator,owner,superuser,staff,auth,i,me,everyone,all,mention,mentions,example,user,users,account,accounts,official,help,helps,support,supports,info,information,informations,announce,announces,announcement,announcements,notice,notification,notifications,dev,developer,developers,tech,misskey}'::character varying[] NOT NULL,
    "enableFanoutTimeline" boolean DEFAULT true NOT NULL,
    "enableFanoutTimelineDbFallback" boolean DEFAULT true NOT NULL,
    "perLocalUserUserTimelineCacheMax" integer DEFAULT 300 NOT NULL,
    "perRemoteUserUserTimelineCacheMax" integer DEFAULT 100 NOT NULL,
    "perUserHomeTimelineCacheMax" integer DEFAULT 300 NOT NULL,
    "perUserListTimelineCacheMax" integer DEFAULT 300 NOT NULL,
    "notesPerOneAd" integer DEFAULT 0 NOT NULL,
    "urlPreviewEnabled" boolean DEFAULT true NOT NULL,
    "urlPreviewAllowRedirect" boolean DEFAULT true NOT NULL,
    "urlPreviewTimeout" integer DEFAULT 10000 NOT NULL,
    "urlPreviewMaximumContentLength" bigint DEFAULT 10485760 NOT NULL,
    "urlPreviewRequireContentLength" boolean DEFAULT false NOT NULL,
    "urlPreviewSummaryProxyUrl" character varying(1024),
    "urlPreviewUserAgent" character varying(1024),
    "federation" character varying(128) DEFAULT 'none'::character varying NOT NULL,
    "federationHosts" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "ugcVisibilityForVisitor" character varying(128) DEFAULT 'local'::character varying NOT NULL,
    "googleAnalyticsMeasurementId" character varying(64),
    "deliverSuspendedSoftware" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "singleUserMode" boolean DEFAULT false NOT NULL,
    "proxyRemoteFiles" boolean DEFAULT true NOT NULL,
    "signToActivityPubGet" boolean DEFAULT true NOT NULL,
    "allowExternalApRedirect" boolean DEFAULT true NOT NULL,
    "enableRemoteNotesCleaning" boolean DEFAULT false NOT NULL,
    "remoteNotesCleaningMaxProcessingDurationInMinutes" integer DEFAULT 60 NOT NULL,
    "remoteNotesCleaningExpiryDaysForEachNotes" integer DEFAULT 90 NOT NULL,
    "showRoleBadgesOfRemoteUsers" boolean DEFAULT false NOT NULL,
    "clientOptions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "signupRateLimitMinIntervalSeconds" integer DEFAULT 0 NOT NULL,
    "signupRateLimitMaxPerHour" integer DEFAULT 0 NOT NULL,
    "translatorProvider" character varying(32) DEFAULT 'deepl'::character varying NOT NULL,
    "libreTranslateApiUrl" character varying(1024),
    "libreTranslateApiKey" character varying(1024),
    "urlPreviewSensitiveList" character varying(3072)[] DEFAULT '{}'::character varying[] NOT NULL,
    "capSiteKey" character varying(1024),
    "capSecretKey" character varying(1024),
    "capInstanceUrl" character varying(1024)
);

-- CONSTRAINT: meta meta_pkey
ALTER TABLE ONLY "public"."meta"
    ADD CONSTRAINT "meta_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
-- TABLE: moderation_log
CREATE TABLE "public"."moderation_log" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "type" character varying(128) NOT NULL,
    "info" "jsonb" NOT NULL
);

-- CONSTRAINT: moderation_log moderation_log_pkey
ALTER TABLE ONLY "public"."moderation_log"
    ADD CONSTRAINT "moderation_log_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_MODERATION_LOG_TYPE_ID
CREATE INDEX "IDX_MODERATION_LOG_TYPE_ID" ON "public"."moderation_log" USING "btree" ("type", "id");

-- INDEX: IDX_MODERATION_LOG_USER_ID
CREATE INDEX "IDX_MODERATION_LOG_USER_ID" ON "public"."moderation_log" USING "btree" ("userId");

-- INDEX: IDX_MODERATION_LOG_USER_ID_ID
CREATE INDEX "IDX_MODERATION_LOG_USER_ID_ID" ON "public"."moderation_log" USING "btree" ("userId", "id");
--> statement-breakpoint
-- TABLE: muting
CREATE TABLE "public"."muting" (
    "id" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone,
    "muteeId" character varying(32) NOT NULL,
    "muterId" character varying(32) NOT NULL
);

-- CONSTRAINT: muting muting_pkey
ALTER TABLE ONLY "public"."muting"
    ADD CONSTRAINT "muting_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_MUTING_EXPIRES_AT
CREATE INDEX "IDX_MUTING_EXPIRES_AT" ON "public"."muting" USING "btree" ("expiresAt");

-- INDEX: IDX_MUTING_MUTEE_ID
CREATE INDEX "IDX_MUTING_MUTEE_ID" ON "public"."muting" USING "btree" ("muteeId");

-- INDEX: IDX_MUTING_MUTER_ID
CREATE INDEX "IDX_MUTING_MUTER_ID" ON "public"."muting" USING "btree" ("muterId");

-- INDEX: IDX_MUTING_MUTER_ID_MUTEE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_MUTING_MUTER_ID_MUTEE_ID_UNIQUE" ON "public"."muting" USING "btree" ("muterId", "muteeId");
--> statement-breakpoint
-- TABLE: note
CREATE TABLE "public"."note" (
    "id" character varying(32) NOT NULL,
    "replyId" character varying(32),
    "renoteId" character varying(32),
    "threadId" character varying(256),
    "text" "text",
    "name" character varying(256),
    "cw" character varying(512),
    "userId" character varying(32) NOT NULL,
    "localOnly" boolean DEFAULT false NOT NULL,
    "reactionAcceptance" character varying(64),
    "renoteCount" smallint DEFAULT 0 NOT NULL,
    "repliesCount" smallint DEFAULT 0 NOT NULL,
    "clippedCount" smallint DEFAULT 0 NOT NULL,
    "pageCount" smallint DEFAULT 0 NOT NULL,
    "reactions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "visibility" "public"."note_visibility_enum" NOT NULL,
    "uri" character varying(512),
    "url" character varying(512),
    "fileIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "attachedFileTypes" character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    "visibleUserIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "mentions" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "mentionedRemoteUsers" "text" DEFAULT '[]'::"text" NOT NULL,
    "reactionAndUserPairCache" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "emojis" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "tags" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "hasPoll" boolean DEFAULT false NOT NULL,
    "channelId" character varying(32),
    "userHost" character varying(128),
    "replyUserId" character varying(32),
    "replyUserHost" character varying(128),
    "renoteUserId" character varying(32),
    "renoteUserHost" character varying(128),
    "renoteChannelId" character varying(32),
    "updatedAt" timestamp with time zone
);

-- CONSTRAINT: note note_pkey
ALTER TABLE ONLY "public"."note"
    ADD CONSTRAINT "note_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_NOTE_CHANNEL_ID
CREATE INDEX "IDX_NOTE_CHANNEL_ID" ON "public"."note" USING "btree" ("channelId");

-- INDEX: IDX_NOTE_FILE_IDS
CREATE INDEX "IDX_NOTE_FILE_IDS" ON "public"."note" USING "gin" ("fileIds") WITH ("fastupdate"='false');

-- INDEX: IDX_NOTE_MENTIONS
CREATE INDEX "IDX_NOTE_MENTIONS" ON "public"."note" USING "gin" ("mentions") WITH ("fastupdate"='false');

-- INDEX: IDX_NOTE_RENOTE_ID
CREATE INDEX "IDX_NOTE_RENOTE_ID" ON "public"."note" USING "btree" ("renoteId");

-- INDEX: IDX_NOTE_REPLY_ID
CREATE INDEX "IDX_NOTE_REPLY_ID" ON "public"."note" USING "btree" ("replyId");

-- INDEX: IDX_NOTE_TAGS
CREATE INDEX "IDX_NOTE_TAGS" ON "public"."note" USING "gin" ("tags") WITH ("fastupdate"='false');

-- INDEX: IDX_NOTE_TEXT_TRGM
CREATE INDEX "IDX_NOTE_TEXT_TRGM" ON "public"."note" USING "gin" ("lower"("text") "gin_trgm_ops") WITH ("fastupdate"='off');

-- INDEX: IDX_NOTE_THREAD_ID
CREATE INDEX "IDX_NOTE_THREAD_ID" ON "public"."note" USING "btree" ("threadId");

-- INDEX: IDX_NOTE_URI_UNIQUE
CREATE UNIQUE INDEX "IDX_NOTE_URI_UNIQUE" ON "public"."note" USING "btree" ("uri");

-- INDEX: IDX_NOTE_USER_HOST
CREATE INDEX "IDX_NOTE_USER_HOST" ON "public"."note" USING "btree" ("userHost");

-- INDEX: IDX_NOTE_USER_ID_ID
CREATE INDEX "IDX_NOTE_USER_ID_ID" ON "public"."note" USING "btree" ("userId", "id");

-- INDEX: IDX_NOTE_VISIBLE_USER_IDS
CREATE INDEX "IDX_NOTE_VISIBLE_USER_IDS" ON "public"."note" USING "gin" ("visibleUserIds") WITH ("fastupdate"='false');
--> statement-breakpoint
-- TABLE: note_draft
CREATE TABLE "public"."note_draft" (
    "id" character varying(32) NOT NULL,
    "replyId" character varying(32),
    "renoteId" character varying(32),
    "text" "text",
    "cw" character varying(512),
    "userId" character varying(32) NOT NULL,
    "localOnly" boolean DEFAULT false NOT NULL,
    "reactionAcceptance" character varying(64),
    "visibility" "public"."note_draft_visibility_enum" NOT NULL,
    "fileIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "visibleUserIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "hashtag" character varying(128),
    "channelId" character varying(32),
    "hasPoll" boolean DEFAULT false NOT NULL,
    "pollChoices" character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    "pollMultiple" boolean NOT NULL,
    "pollExpiresAt" timestamp with time zone,
    "pollExpiredAfter" bigint,
    "scheduledAt" timestamp with time zone,
    "isActuallyScheduled" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: note_draft note_draft_pkey
ALTER TABLE ONLY "public"."note_draft"
    ADD CONSTRAINT "note_draft_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_NOTE_DRAFT_CHANNEL_ID
CREATE INDEX "IDX_NOTE_DRAFT_CHANNEL_ID" ON "public"."note_draft" USING "btree" ("channelId");

-- INDEX: IDX_NOTE_DRAFT_FILE_IDS
CREATE INDEX "IDX_NOTE_DRAFT_FILE_IDS" ON "public"."note_draft" USING "gin" ("fileIds");

-- INDEX: IDX_NOTE_DRAFT_RENOTE_ID
CREATE INDEX "IDX_NOTE_DRAFT_RENOTE_ID" ON "public"."note_draft" USING "btree" ("renoteId");

-- INDEX: IDX_NOTE_DRAFT_REPLY_ID
CREATE INDEX "IDX_NOTE_DRAFT_REPLY_ID" ON "public"."note_draft" USING "btree" ("replyId");

-- INDEX: IDX_NOTE_DRAFT_USER_ID
CREATE INDEX "IDX_NOTE_DRAFT_USER_ID" ON "public"."note_draft" USING "btree" ("userId");

-- INDEX: IDX_NOTE_DRAFT_VISIBLE_USER_IDS
CREATE INDEX "IDX_NOTE_DRAFT_VISIBLE_USER_IDS" ON "public"."note_draft" USING "gin" ("visibleUserIds");
--> statement-breakpoint
-- TABLE: note_favorite
CREATE TABLE "public"."note_favorite" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL
);

-- CONSTRAINT: note_favorite note_favorite_pkey
ALTER TABLE ONLY "public"."note_favorite"
    ADD CONSTRAINT "note_favorite_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_NOTE_FAVORITE_NOTE_ID
CREATE INDEX "IDX_NOTE_FAVORITE_NOTE_ID" ON "public"."note_favorite" USING "btree" ("noteId");

-- INDEX: IDX_NOTE_FAVORITE_USER_ID
CREATE INDEX "IDX_NOTE_FAVORITE_USER_ID" ON "public"."note_favorite" USING "btree" ("userId");

-- INDEX: IDX_NOTE_FAVORITE_USER_ID_NOTE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_NOTE_FAVORITE_USER_ID_NOTE_ID_UNIQUE" ON "public"."note_favorite" USING "btree" ("userId", "noteId");
--> statement-breakpoint
-- TABLE: note_reaction
CREATE TABLE "public"."note_reaction" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    "reaction" character varying(260) NOT NULL
);

-- CONSTRAINT: note_reaction note_reaction_pkey
ALTER TABLE ONLY "public"."note_reaction"
    ADD CONSTRAINT "note_reaction_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_NOTE_REACTION_NOTE_ID
CREATE INDEX "IDX_NOTE_REACTION_NOTE_ID" ON "public"."note_reaction" USING "btree" ("noteId");

-- INDEX: IDX_NOTE_REACTION_NOTE_ID_ID
CREATE INDEX "IDX_NOTE_REACTION_NOTE_ID_ID" ON "public"."note_reaction" USING "btree" ("noteId", "id");

-- INDEX: IDX_NOTE_REACTION_USER_ID
CREATE INDEX "IDX_NOTE_REACTION_USER_ID" ON "public"."note_reaction" USING "btree" ("userId");

-- INDEX: IDX_NOTE_REACTION_USER_ID_ID
CREATE INDEX "IDX_NOTE_REACTION_USER_ID_ID" ON "public"."note_reaction" USING "btree" ("userId", "id");

-- INDEX: IDX_NOTE_REACTION_USER_ID_NOTE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_NOTE_REACTION_USER_ID_NOTE_ID_UNIQUE" ON "public"."note_reaction" USING "btree" ("userId", "noteId");
--> statement-breakpoint
-- TABLE: note_thread_muting
CREATE TABLE "public"."note_thread_muting" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "threadId" character varying(256) NOT NULL
);

-- CONSTRAINT: note_thread_muting note_thread_muting_pkey
ALTER TABLE ONLY "public"."note_thread_muting"
    ADD CONSTRAINT "note_thread_muting_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_NOTE_THREAD_MUTING_THREAD_ID
CREATE INDEX "IDX_NOTE_THREAD_MUTING_THREAD_ID" ON "public"."note_thread_muting" USING "btree" ("threadId");

-- INDEX: IDX_NOTE_THREAD_MUTING_USER_ID
CREATE INDEX "IDX_NOTE_THREAD_MUTING_USER_ID" ON "public"."note_thread_muting" USING "btree" ("userId");

-- INDEX: IDX_NOTE_THREAD_MUTING_USER_ID_THREAD_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_NOTE_THREAD_MUTING_USER_ID_THREAD_ID_UNIQUE" ON "public"."note_thread_muting" USING "btree" ("userId", "threadId");
--> statement-breakpoint
-- TABLE: page
CREATE TABLE "public"."page" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "title" character varying(256) NOT NULL,
    "name" character varying(256) NOT NULL,
    "summary" character varying(256),
    "alignCenter" boolean NOT NULL,
    "hideTitleWhenPinned" boolean DEFAULT false NOT NULL,
    "font" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "eyeCatchingImageId" character varying(32),
    "content" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "variables" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "script" character varying(16384) DEFAULT ''::character varying NOT NULL,
    "visibility" "public"."page_visibility_enum" NOT NULL,
    "visibleUserIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "likedCount" integer DEFAULT 0 NOT NULL
);

-- CONSTRAINT: page page_pkey
ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_PAGE_EYE_CATCHING_IMAGE_ID
CREATE INDEX "IDX_PAGE_EYE_CATCHING_IMAGE_ID" ON "public"."page" USING "btree" ("eyeCatchingImageId");

-- INDEX: IDX_PAGE_NAME
CREATE INDEX "IDX_PAGE_NAME" ON "public"."page" USING "btree" ("name");

-- INDEX: IDX_PAGE_UPDATED_AT
CREATE INDEX "IDX_PAGE_UPDATED_AT" ON "public"."page" USING "btree" ("updatedAt");

-- INDEX: IDX_PAGE_USER_ID
CREATE INDEX "IDX_PAGE_USER_ID" ON "public"."page" USING "btree" ("userId");

-- INDEX: IDX_PAGE_USER_ID_NAME_UNIQUE
CREATE UNIQUE INDEX "IDX_PAGE_USER_ID_NAME_UNIQUE" ON "public"."page" USING "btree" ("userId", "name");

-- INDEX: IDX_PAGE_VISIBLE_USER_IDS
CREATE INDEX "IDX_PAGE_VISIBLE_USER_IDS" ON "public"."page" USING "btree" ("visibleUserIds");
--> statement-breakpoint
-- TABLE: page_like
CREATE TABLE "public"."page_like" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "pageId" character varying(32) NOT NULL
);

-- CONSTRAINT: page_like page_like_pkey
ALTER TABLE ONLY "public"."page_like"
    ADD CONSTRAINT "page_like_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_PAGE_LIKE_PAGE_ID
CREATE INDEX "IDX_PAGE_LIKE_PAGE_ID" ON "public"."page_like" USING "btree" ("pageId");

-- INDEX: IDX_PAGE_LIKE_USER_ID
CREATE INDEX "IDX_PAGE_LIKE_USER_ID" ON "public"."page_like" USING "btree" ("userId");

-- INDEX: IDX_PAGE_LIKE_USER_ID_PAGE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_PAGE_LIKE_USER_ID_PAGE_ID_UNIQUE" ON "public"."page_like" USING "btree" ("userId", "pageId");
--> statement-breakpoint
-- TABLE: password_reset_request
CREATE TABLE "public"."password_reset_request" (
    "id" character varying(32) NOT NULL,
    "token" character varying(256) NOT NULL,
    "userId" character varying(32) NOT NULL
);

-- CONSTRAINT: password_reset_request password_reset_request_pkey
ALTER TABLE ONLY "public"."password_reset_request"
    ADD CONSTRAINT "password_reset_request_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_PASSWORD_RESET_REQUEST_TOKEN_UNIQUE
CREATE UNIQUE INDEX "IDX_PASSWORD_RESET_REQUEST_TOKEN_UNIQUE" ON "public"."password_reset_request" USING "btree" ("token");

-- INDEX: IDX_PASSWORD_RESET_REQUEST_USER_ID
CREATE INDEX "IDX_PASSWORD_RESET_REQUEST_USER_ID" ON "public"."password_reset_request" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: poll
CREATE TABLE "public"."poll" (
    "noteId" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone,
    "multiple" boolean NOT NULL,
    "choices" character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    "votes" integer[] NOT NULL,
    "noteVisibility" "public"."poll_notevisibility_enum" NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userHost" character varying(128),
    "channelId" character varying(32)
);

-- CONSTRAINT: poll poll_pkey
ALTER TABLE ONLY "public"."poll"
    ADD CONSTRAINT "poll_pkey" PRIMARY KEY ("noteId");

-- INDEX: IDX_POLL_CHANNEL_ID
CREATE INDEX "IDX_POLL_CHANNEL_ID" ON "public"."poll" USING "btree" ("channelId");

-- INDEX: IDX_POLL_USER_HOST
CREATE INDEX "IDX_POLL_USER_HOST" ON "public"."poll" USING "btree" ("userHost");

-- INDEX: IDX_POLL_USER_ID
CREATE INDEX "IDX_POLL_USER_ID" ON "public"."poll" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: poll_vote
CREATE TABLE "public"."poll_vote" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    "choice" integer NOT NULL
);

-- CONSTRAINT: poll_vote poll_vote_pkey
ALTER TABLE ONLY "public"."poll_vote"
    ADD CONSTRAINT "poll_vote_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_POLL_VOTE_NOTE_ID
CREATE INDEX "IDX_POLL_VOTE_NOTE_ID" ON "public"."poll_vote" USING "btree" ("noteId");

-- INDEX: IDX_POLL_VOTE_USER_ID
CREATE INDEX "IDX_POLL_VOTE_USER_ID" ON "public"."poll_vote" USING "btree" ("userId");

-- INDEX: IDX_POLL_VOTE_USER_ID_NOTE_ID_CHOICE_UNIQUE
CREATE UNIQUE INDEX "IDX_POLL_VOTE_USER_ID_NOTE_ID_CHOICE_UNIQUE" ON "public"."poll_vote" USING "btree" ("userId", "noteId", "choice");
--> statement-breakpoint
-- TABLE: promo_note
CREATE TABLE "public"."promo_note" (
    "noteId" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL
);

-- CONSTRAINT: promo_note promo_note_pkey
ALTER TABLE ONLY "public"."promo_note"
    ADD CONSTRAINT "promo_note_pkey" PRIMARY KEY ("noteId");

-- INDEX: IDX_PROMO_NOTE_USER_ID
CREATE INDEX "IDX_PROMO_NOTE_USER_ID" ON "public"."promo_note" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: promo_read
CREATE TABLE "public"."promo_read" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL
);

-- CONSTRAINT: promo_read promo_read_pkey
ALTER TABLE ONLY "public"."promo_read"
    ADD CONSTRAINT "promo_read_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_PROMO_READ_NOTE_ID
CREATE INDEX "IDX_PROMO_READ_NOTE_ID" ON "public"."promo_read" USING "btree" ("noteId");

-- INDEX: IDX_PROMO_READ_USER_ID
CREATE INDEX "IDX_PROMO_READ_USER_ID" ON "public"."promo_read" USING "btree" ("userId");

-- INDEX: IDX_PROMO_READ_USER_ID_NOTE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_PROMO_READ_USER_ID_NOTE_ID_UNIQUE" ON "public"."promo_read" USING "btree" ("userId", "noteId");
--> statement-breakpoint
-- TABLE: queue_outbox
CREATE TABLE "public"."queue_outbox" (
    "id" character varying(32) NOT NULL,
    "queue" character varying(64) NOT NULL,
    "name" character varying(128) NOT NULL,
    "data" "jsonb" NOT NULL,
    "opts" "jsonb" NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" character varying(32) DEFAULT 'job'::character varying NOT NULL,
    "state" character varying(32) DEFAULT 'ready'::character varying NOT NULL,
    "coordinatorId" character varying(32),
    "externalJobId" character varying(128),
    "availableAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "leaseToken" character varying(64),
    "leaseExpiresAt" timestamp with time zone,
    "pollIntervalMs" integer DEFAULT 1000 NOT NULL,
    "deadLetterReason" character varying(32),
    "lastError" "jsonb",
    "revision" integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL
);

-- CONSTRAINT: queue_outbox queue_outbox_pkey
ALTER TABLE ONLY "public"."queue_outbox"
    ADD CONSTRAINT "queue_outbox_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_QUEUE_OUTBOX_COORDINATOR_ID
CREATE INDEX "IDX_QUEUE_OUTBOX_COORDINATOR_ID" ON "public"."queue_outbox" USING "btree" ("coordinatorId");

-- INDEX: IDX_QUEUE_OUTBOX_STATE_AVAILABLE_AT
CREATE INDEX "IDX_QUEUE_OUTBOX_STATE_AVAILABLE_AT" ON "public"."queue_outbox" USING "btree" ("state", "availableAt", "createdAt");

-- INDEX: IDX_QUEUE_OUTBOX_STATE_ID
CREATE INDEX "IDX_QUEUE_OUTBOX_STATE_ID" ON "public"."queue_outbox" USING "btree" ("state", "id");
--> statement-breakpoint
-- TABLE: registration_ticket
CREATE TABLE "public"."registration_ticket" (
    "id" character varying(32) NOT NULL,
    "code" character varying(64) NOT NULL,
    "expiresAt" timestamp with time zone,
    "createdById" character varying(32),
    "usedById" character varying(32),
    "usedAt" timestamp with time zone,
    "pendingUserId" character varying(32)
);

-- CONSTRAINT: registration_ticket registration_ticket_pkey
ALTER TABLE ONLY "public"."registration_ticket"
    ADD CONSTRAINT "registration_ticket_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_REGISTRATION_TICKET_CODE_UNIQUE
CREATE UNIQUE INDEX "IDX_REGISTRATION_TICKET_CODE_UNIQUE" ON "public"."registration_ticket" USING "btree" ("code");

-- INDEX: IDX_REGISTRATION_TICKET_CREATED_BY_ID
CREATE INDEX "IDX_REGISTRATION_TICKET_CREATED_BY_ID" ON "public"."registration_ticket" USING "btree" ("createdById");

-- INDEX: IDX_REGISTRATION_TICKET_USED_BY_ID
CREATE INDEX "IDX_REGISTRATION_TICKET_USED_BY_ID" ON "public"."registration_ticket" USING "btree" ("usedById");

-- INDEX: REL_b6f93f2f30bdbb9a5ebdc7c718
CREATE UNIQUE INDEX "REL_b6f93f2f30bdbb9a5ebdc7c718" ON "public"."registration_ticket" USING "btree" ("usedById");
--> statement-breakpoint
-- TABLE: registry_item
CREATE TABLE "public"."registry_item" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL,
    "key" character varying(1024) NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb",
    "scope" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "domain" character varying(512)
);

-- CONSTRAINT: registry_item UQ_REGISTRY_ITEM_USER_ID_DOMAIN_SCOPE_KEY
ALTER TABLE ONLY "public"."registry_item"
    ADD CONSTRAINT "UQ_REGISTRY_ITEM_USER_ID_DOMAIN_SCOPE_KEY" UNIQUE NULLS NOT DISTINCT ("userId", "domain", "scope", "key");

-- CONSTRAINT: registry_item registry_item_pkey
ALTER TABLE ONLY "public"."registry_item"
    ADD CONSTRAINT "registry_item_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_REGISTRY_ITEM_DOMAIN
CREATE INDEX "IDX_REGISTRY_ITEM_DOMAIN" ON "public"."registry_item" USING "btree" ("domain");

-- INDEX: IDX_REGISTRY_ITEM_SCOPE
CREATE INDEX "IDX_REGISTRY_ITEM_SCOPE" ON "public"."registry_item" USING "btree" ("scope");

-- INDEX: IDX_REGISTRY_ITEM_USER_ID
CREATE INDEX "IDX_REGISTRY_ITEM_USER_ID" ON "public"."registry_item" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: relay
CREATE TABLE "public"."relay" (
    "id" character varying(32) NOT NULL,
    "inbox" character varying(512) NOT NULL,
    "status" "public"."relay_status_enum" NOT NULL
);

-- CONSTRAINT: relay relay_pkey
ALTER TABLE ONLY "public"."relay"
    ADD CONSTRAINT "relay_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_RELAY_INBOX_UNIQUE
CREATE UNIQUE INDEX "IDX_RELAY_INBOX_UNIQUE" ON "public"."relay" USING "btree" ("inbox");

-- INDEX: IDX_relay_status
CREATE INDEX "IDX_relay_status" ON "public"."relay" USING "btree" ("status");
--> statement-breakpoint
-- TABLE: renote_muting
CREATE TABLE "public"."renote_muting" (
    "id" character varying(32) NOT NULL,
    "muteeId" character varying(32) NOT NULL,
    "muterId" character varying(32) NOT NULL
);

-- CONSTRAINT: renote_muting renote_muting_pkey
ALTER TABLE ONLY "public"."renote_muting"
    ADD CONSTRAINT "renote_muting_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_RENOTE_MUTING_MUTEE_ID
CREATE INDEX "IDX_RENOTE_MUTING_MUTEE_ID" ON "public"."renote_muting" USING "btree" ("muteeId");

-- INDEX: IDX_RENOTE_MUTING_MUTER_ID
CREATE INDEX "IDX_RENOTE_MUTING_MUTER_ID" ON "public"."renote_muting" USING "btree" ("muterId");

-- INDEX: IDX_RENOTE_MUTING_MUTER_ID_MUTEE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_RENOTE_MUTING_MUTER_ID_MUTEE_ID_UNIQUE" ON "public"."renote_muting" USING "btree" ("muterId", "muteeId");
--> statement-breakpoint
-- TABLE: retention_aggregation
CREATE TABLE "public"."retention_aggregation" (
    "id" character varying(32) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "dateKey" character varying(512) NOT NULL,
    "userIds" character varying(32)[] NOT NULL,
    "usersCount" integer NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);

-- CONSTRAINT: retention_aggregation retention_aggregation_pkey
ALTER TABLE ONLY "public"."retention_aggregation"
    ADD CONSTRAINT "retention_aggregation_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_RETENTION_AGGREGATION_CREATED_AT
CREATE INDEX "IDX_RETENTION_AGGREGATION_CREATED_AT" ON "public"."retention_aggregation" USING "btree" ("createdAt");

-- INDEX: IDX_RETENTION_AGGREGATION_DATE_KEY_UNIQUE
CREATE UNIQUE INDEX "IDX_RETENTION_AGGREGATION_DATE_KEY_UNIQUE" ON "public"."retention_aggregation" USING "btree" ("dateKey");
--> statement-breakpoint
-- TABLE: role
CREATE TABLE "public"."role" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "lastUsedAt" timestamp with time zone NOT NULL,
    "name" character varying(256) NOT NULL,
    "description" character varying(1024) NOT NULL,
    "color" character varying(256),
    "iconUrl" character varying(512),
    "target" "public"."role_target_enum" DEFAULT 'manual'::"public"."role_target_enum" NOT NULL,
    "condFormula" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "isPublic" boolean DEFAULT false NOT NULL,
    "asBadge" boolean DEFAULT false NOT NULL,
    "isModerator" boolean DEFAULT false NOT NULL,
    "isAdministrator" boolean DEFAULT false NOT NULL,
    "isExplorable" boolean DEFAULT false NOT NULL,
    "preserveAssignmentOnMoveAccount" boolean DEFAULT false NOT NULL,
    "canEditMembersByModerator" boolean DEFAULT false NOT NULL,
    "displayOrder" integer DEFAULT 0 NOT NULL,
    "policies" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);

-- CONSTRAINT: role role_pkey
ALTER TABLE ONLY "public"."role"
    ADD CONSTRAINT "role_pkey" PRIMARY KEY ("id");
--> statement-breakpoint
-- TABLE: role_assignment
CREATE TABLE "public"."role_assignment" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "roleId" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone
);

-- CONSTRAINT: role_assignment role_assignment_pkey
ALTER TABLE ONLY "public"."role_assignment"
    ADD CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ROLE_ASSIGNMENT_EXPIRES_AT
CREATE INDEX "IDX_ROLE_ASSIGNMENT_EXPIRES_AT" ON "public"."role_assignment" USING "btree" ("expiresAt");

-- INDEX: IDX_ROLE_ASSIGNMENT_ROLE_ID
CREATE INDEX "IDX_ROLE_ASSIGNMENT_ROLE_ID" ON "public"."role_assignment" USING "btree" ("roleId");

-- INDEX: IDX_ROLE_ASSIGNMENT_USER_ID
CREATE INDEX "IDX_ROLE_ASSIGNMENT_USER_ID" ON "public"."role_assignment" USING "btree" ("userId");

-- INDEX: IDX_ROLE_ASSIGNMENT_USER_ID_ROLE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_ROLE_ASSIGNMENT_USER_ID_ROLE_ID_UNIQUE" ON "public"."role_assignment" USING "btree" ("userId", "roleId");
--> statement-breakpoint
-- TABLE: signin
CREATE TABLE "public"."signin" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "ip" character varying(128) NOT NULL,
    "headers" "jsonb" NOT NULL,
    "success" boolean NOT NULL
);

-- CONSTRAINT: signin signin_pkey
ALTER TABLE ONLY "public"."signin"
    ADD CONSTRAINT "signin_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_SIGNIN_USER_ID
CREATE INDEX "IDX_SIGNIN_USER_ID" ON "public"."signin" USING "btree" ("userId");

-- INDEX: IDX_SIGNIN_USER_ID_ID
CREATE INDEX "IDX_SIGNIN_USER_ID_ID" ON "public"."signin" USING "btree" ("userId", "id");
--> statement-breakpoint
-- TABLE: sw_subscription
CREATE TABLE "public"."sw_subscription" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "endpoint" character varying(512) NOT NULL,
    "auth" character varying(256) NOT NULL,
    "publickey" character varying(128) NOT NULL,
    "sendReadMessage" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: sw_subscription sw_subscription_pkey
ALTER TABLE ONLY "public"."sw_subscription"
    ADD CONSTRAINT "sw_subscription_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_SW_SUBSCRIPTION_ENDPOINT
CREATE INDEX "IDX_SW_SUBSCRIPTION_ENDPOINT" ON "public"."sw_subscription" USING "btree" ("endpoint");

-- INDEX: IDX_SW_SUBSCRIPTION_USER_ID_ENDPOINT_UNIQUE
CREATE UNIQUE INDEX "IDX_SW_SUBSCRIPTION_USER_ID_ENDPOINT_UNIQUE" ON "public"."sw_subscription" USING "btree" ("userId", "endpoint");
--> statement-breakpoint
-- TABLE: system_account
CREATE TABLE "public"."system_account" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "type" character varying(256) NOT NULL
);

-- CONSTRAINT: system_account system_account_pkey
ALTER TABLE ONLY "public"."system_account"
    ADD CONSTRAINT "system_account_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_SYSTEM_ACCOUNT_TYPE_UNIQUE
CREATE UNIQUE INDEX "IDX_SYSTEM_ACCOUNT_TYPE_UNIQUE" ON "public"."system_account" USING "btree" ("type");

-- INDEX: IDX_SYSTEM_ACCOUNT_USER_ID
CREATE INDEX "IDX_SYSTEM_ACCOUNT_USER_ID" ON "public"."system_account" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: system_webhook
CREATE TABLE "public"."system_webhook" (
    "id" character varying(32) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latestSentAt" timestamp with time zone,
    "latestStatus" integer,
    "name" character varying(255) NOT NULL,
    "on" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "url" character varying(1024) NOT NULL,
    "secret" character varying(1024) NOT NULL
);

-- CONSTRAINT: system_webhook system_webhook_pkey
ALTER TABLE ONLY "public"."system_webhook"
    ADD CONSTRAINT "system_webhook_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_system_webhook_isActive
CREATE INDEX "IDX_system_webhook_isActive" ON "public"."system_webhook" USING "btree" ("isActive");

-- INDEX: IDX_system_webhook_on
CREATE INDEX "IDX_system_webhook_on" ON "public"."system_webhook" USING "gin" ("on");
--> statement-breakpoint
-- TABLE: used_username
CREATE TABLE "public"."used_username" (
    "username" character varying(128) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL
);

-- CONSTRAINT: used_username used_username_pkey
ALTER TABLE ONLY "public"."used_username"
    ADD CONSTRAINT "used_username_pkey" PRIMARY KEY ("username");
--> statement-breakpoint
-- TABLE: user
CREATE TABLE "public"."user" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone,
    "lastFetchedAt" timestamp with time zone,
    "lastActiveDate" timestamp with time zone,
    "hideOnlineStatus" boolean DEFAULT false NOT NULL,
    "username" character varying(128) NOT NULL,
    "usernameLower" character varying(128) NOT NULL,
    "name" character varying(128),
    "followersCount" integer DEFAULT 0 NOT NULL,
    "followingCount" integer DEFAULT 0 NOT NULL,
    "movedToUri" character varying(512),
    "movedAt" timestamp with time zone,
    "alsoKnownAs" "text",
    "notesCount" integer DEFAULT 0 NOT NULL,
    "avatarId" character varying(32),
    "bannerId" character varying(32),
    "avatarUrl" character varying(1024),
    "bannerUrl" character varying(512),
    "avatarBlurhash" character varying(128),
    "bannerBlurhash" character varying(128),
    "avatarDecorations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tags" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "isSuspended" boolean DEFAULT false NOT NULL,
    "isLocked" boolean DEFAULT false NOT NULL,
    "isBot" boolean DEFAULT false NOT NULL,
    "isCat" boolean DEFAULT false NOT NULL,
    "isExplorable" boolean DEFAULT true NOT NULL,
    "isHibernated" boolean DEFAULT false NOT NULL,
    "requireSigninToViewContents" boolean DEFAULT false NOT NULL,
    "makeNotesFollowersOnlyBefore" integer,
    "makeNotesHiddenBefore" integer,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "emojis" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "chatScope" character varying(128) DEFAULT 'mutual'::character varying NOT NULL,
    "host" character varying(128),
    "inbox" character varying(512),
    "sharedInbox" character varying(512),
    "featured" character varying(512),
    "uri" character varying(512),
    "followersUri" character varying(512),
    "token" character(16),
    "suspensionTransitionId" character varying(32)
);

-- CONSTRAINT: user user_pkey
ALTER TABLE ONLY "public"."user"
    ADD CONSTRAINT "user_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_FOLLOWERS_COUNT
CREATE INDEX "IDX_USER_FOLLOWERS_COUNT" ON "public"."user" USING "btree" ("followersCount");

-- INDEX: IDX_USER_HOST
CREATE INDEX "IDX_USER_HOST" ON "public"."user" USING "btree" ("host");

-- INDEX: IDX_USER_IS_EXPLORABLE
CREATE INDEX "IDX_USER_IS_EXPLORABLE" ON "public"."user" USING "btree" ("isExplorable");

-- INDEX: IDX_USER_LAST_ACTIVE_DATE
CREATE INDEX "IDX_USER_LAST_ACTIVE_DATE" ON "public"."user" USING "btree" ("lastActiveDate");

-- INDEX: IDX_USER_NAME_TRGM
CREATE INDEX "IDX_USER_NAME_TRGM" ON "public"."user" USING "gin" ("name" "gin_trgm_ops");

-- INDEX: IDX_USER_TAGS
CREATE INDEX "IDX_USER_TAGS" ON "public"."user" USING "btree" ("tags");

-- INDEX: IDX_USER_TOKEN_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_TOKEN_UNIQUE" ON "public"."user" USING "btree" ("token");

-- INDEX: IDX_USER_UPDATED_AT
CREATE INDEX "IDX_USER_UPDATED_AT" ON "public"."user" USING "btree" ("updatedAt");

-- INDEX: IDX_USER_UPDATED_AT_DESC_NULLS_LAST
CREATE INDEX "IDX_USER_UPDATED_AT_DESC_NULLS_LAST" ON "public"."user" USING "btree" ("updatedAt" DESC NULLS LAST);

-- INDEX: IDX_USER_URI
CREATE INDEX "IDX_USER_URI" ON "public"."user" USING "btree" ("uri");

-- INDEX: IDX_USER_USERNAME_LOWER
CREATE INDEX "IDX_USER_USERNAME_LOWER" ON "public"."user" USING "btree" ("usernameLower");

-- INDEX: IDX_USER_USERNAME_LOWER_HOST_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_USERNAME_LOWER_HOST_UNIQUE" ON "public"."user" USING "btree" ("usernameLower", "host");

-- INDEX: IDX_USER_USERNAME_LOWER_PATTERN
CREATE INDEX "IDX_USER_USERNAME_LOWER_PATTERN" ON "public"."user" USING "btree" ("usernameLower" "varchar_pattern_ops");

-- INDEX: IDX_USER_USERNAME_LOWER_TRGM
CREATE INDEX "IDX_USER_USERNAME_LOWER_TRGM" ON "public"."user" USING "gin" ("usernameLower" "gin_trgm_ops");

-- INDEX: REL_58f5c71eaab331645112cf8cfa
CREATE UNIQUE INDEX "REL_58f5c71eaab331645112cf8cfa" ON "public"."user" USING "btree" ("avatarId");

-- INDEX: REL_afc64b53f8db3707ceb34eb28e
CREATE UNIQUE INDEX "REL_afc64b53f8db3707ceb34eb28e" ON "public"."user" USING "btree" ("bannerId");
--> statement-breakpoint
-- TABLE: user_ip
CREATE TABLE "public"."user_ip" (
    "id" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL,
    "ip" character varying(128) NOT NULL
);

-- SEQUENCE: user_ip_id_seq
CREATE SEQUENCE "public"."user_ip_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: user_ip_id_seq
ALTER SEQUENCE "public"."user_ip_id_seq" OWNED BY "public"."user_ip"."id";

-- DEFAULT: user_ip id
ALTER TABLE ONLY "public"."user_ip" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_ip_id_seq"'::"regclass");

-- CONSTRAINT: user_ip user_ip_pkey
ALTER TABLE ONLY "public"."user_ip"
    ADD CONSTRAINT "user_ip_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_IP_USER_ID
CREATE INDEX "IDX_USER_IP_USER_ID" ON "public"."user_ip" USING "btree" ("userId");

-- INDEX: IDX_USER_IP_USER_ID_IP_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_IP_USER_ID_IP_UNIQUE" ON "public"."user_ip" USING "btree" ("userId", "ip");
--> statement-breakpoint
-- TABLE: user_keypair
CREATE TABLE "public"."user_keypair" (
    "userId" character varying(32) NOT NULL,
    "publicKey" character varying(4096) NOT NULL,
    "privateKey" character varying(4096) NOT NULL
);

-- CONSTRAINT: user_keypair user_keypair_pkey
ALTER TABLE ONLY "public"."user_keypair"
    ADD CONSTRAINT "user_keypair_pkey" PRIMARY KEY ("userId");
--> statement-breakpoint
-- TABLE: user_list
CREATE TABLE "public"."user_list" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "isPublic" boolean DEFAULT false NOT NULL,
    "name" character varying(128) NOT NULL
);

-- CONSTRAINT: user_list user_list_pkey
ALTER TABLE ONLY "public"."user_list"
    ADD CONSTRAINT "user_list_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_LIST_IS_PUBLIC
CREATE INDEX "IDX_USER_LIST_IS_PUBLIC" ON "public"."user_list" USING "btree" ("isPublic");

-- INDEX: IDX_USER_LIST_USER_ID
CREATE INDEX "IDX_USER_LIST_USER_ID" ON "public"."user_list" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: user_list_favorite
CREATE TABLE "public"."user_list_favorite" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userListId" character varying(32) NOT NULL
);

-- CONSTRAINT: user_list_favorite user_list_favorite_pkey
ALTER TABLE ONLY "public"."user_list_favorite"
    ADD CONSTRAINT "user_list_favorite_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_LIST_FAVORITE_USER_ID
CREATE INDEX "IDX_USER_LIST_FAVORITE_USER_ID" ON "public"."user_list_favorite" USING "btree" ("userId");

-- INDEX: IDX_USER_LIST_FAVORITE_USER_ID_USER_LIST_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_LIST_FAVORITE_USER_ID_USER_LIST_ID_UNIQUE" ON "public"."user_list_favorite" USING "btree" ("userId", "userListId");

-- INDEX: IDX_USER_LIST_FAVORITE_USER_LIST_ID
CREATE INDEX "IDX_USER_LIST_FAVORITE_USER_LIST_ID" ON "public"."user_list_favorite" USING "btree" ("userListId");
--> statement-breakpoint
-- TABLE: user_list_membership
CREATE TABLE "public"."user_list_membership" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userListId" character varying(32) NOT NULL,
    "withReplies" boolean DEFAULT false NOT NULL,
    "userListUserId" character varying(32) NOT NULL
);

-- CONSTRAINT: user_list_membership user_list_membership_pkey
ALTER TABLE ONLY "public"."user_list_membership"
    ADD CONSTRAINT "user_list_membership_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_LIST_MEMBERSHIP_USER_ID
CREATE INDEX "IDX_USER_LIST_MEMBERSHIP_USER_ID" ON "public"."user_list_membership" USING "btree" ("userId");

-- INDEX: IDX_USER_LIST_MEMBERSHIP_USER_ID_USER_LIST_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_LIST_MEMBERSHIP_USER_ID_USER_LIST_ID_UNIQUE" ON "public"."user_list_membership" USING "btree" ("userId", "userListId");

-- INDEX: IDX_USER_LIST_MEMBERSHIP_USER_LIST_ID
CREATE INDEX "IDX_USER_LIST_MEMBERSHIP_USER_LIST_ID" ON "public"."user_list_membership" USING "btree" ("userListId");
--> statement-breakpoint
-- TABLE: user_memo
CREATE TABLE "public"."user_memo" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "targetUserId" character varying(32) NOT NULL,
    "memo" character varying(2048) NOT NULL
);

-- CONSTRAINT: user_memo user_memo_pkey
ALTER TABLE ONLY "public"."user_memo"
    ADD CONSTRAINT "user_memo_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_MEMO_TARGET_USER_ID
CREATE INDEX "IDX_USER_MEMO_TARGET_USER_ID" ON "public"."user_memo" USING "btree" ("targetUserId");

-- INDEX: IDX_USER_MEMO_USER_ID
CREATE INDEX "IDX_USER_MEMO_USER_ID" ON "public"."user_memo" USING "btree" ("userId");

-- INDEX: IDX_USER_MEMO_USER_ID_TARGET_USER_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_MEMO_USER_ID_TARGET_USER_ID_UNIQUE" ON "public"."user_memo" USING "btree" ("userId", "targetUserId");
--> statement-breakpoint
-- TABLE: user_note_pining
CREATE TABLE "public"."user_note_pining" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL
);

-- CONSTRAINT: user_note_pining user_note_pining_pkey
ALTER TABLE ONLY "public"."user_note_pining"
    ADD CONSTRAINT "user_note_pining_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_NOTE_PINING_NOTE_ID
CREATE INDEX "IDX_USER_NOTE_PINING_NOTE_ID" ON "public"."user_note_pining" USING "btree" ("noteId");

-- INDEX: IDX_USER_NOTE_PINING_USER_ID
CREATE INDEX "IDX_USER_NOTE_PINING_USER_ID" ON "public"."user_note_pining" USING "btree" ("userId");

-- INDEX: IDX_USER_NOTE_PINING_USER_ID_NOTE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_NOTE_PINING_USER_ID_NOTE_ID_UNIQUE" ON "public"."user_note_pining" USING "btree" ("userId", "noteId");
--> statement-breakpoint
-- TABLE: user_pending
CREATE TABLE "public"."user_pending" (
    "id" character varying(32) NOT NULL,
    "code" character varying(128) NOT NULL,
    "username" character varying(128) NOT NULL,
    "email" character varying(128) NOT NULL,
    "password" character varying(128) NOT NULL
);

-- CONSTRAINT: user_pending user_pending_pkey
ALTER TABLE ONLY "public"."user_pending"
    ADD CONSTRAINT "user_pending_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_PENDING_CODE_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_PENDING_CODE_UNIQUE" ON "public"."user_pending" USING "btree" ("code");
--> statement-breakpoint
-- TABLE: user_profile
CREATE TABLE "public"."user_profile" (
    "userId" character varying(32) NOT NULL,
    "location" character varying(128),
    "birthday" character(10),
    "description" character varying(2048),
    "followedMessage" character varying(256),
    "fields" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "verifiedLinks" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "lang" character varying(32),
    "url" character varying(512),
    "email" character varying(128),
    "emailVerifyCode" character varying(128),
    "emailVerified" boolean DEFAULT false NOT NULL,
    "emailNotificationTypes" "jsonb" DEFAULT '["follow", "receiveFollowRequest"]'::"jsonb" NOT NULL,
    "publicReactions" boolean DEFAULT true NOT NULL,
    "followingVisibility" "public"."user_profile_followingvisibility_enum" DEFAULT 'public'::"public"."user_profile_followingvisibility_enum" NOT NULL,
    "followersVisibility" "public"."user_profile_followersvisibility_enum" DEFAULT 'public'::"public"."user_profile_followersvisibility_enum" NOT NULL,
    "twoFactorTempSecret" character varying(128),
    "twoFactorSecret" character varying(128),
    "twoFactorBackupSecret" character varying[],
    "twoFactorEnabled" boolean DEFAULT false NOT NULL,
    "securityKeysAvailable" boolean DEFAULT false NOT NULL,
    "usePasswordLessLogin" boolean DEFAULT false NOT NULL,
    "password" character varying(128),
    "moderationNote" character varying(8192) DEFAULT ''::character varying NOT NULL,
    "autoAcceptFollowed" boolean DEFAULT false NOT NULL,
    "noCrawle" boolean DEFAULT false NOT NULL,
    "preventAiLearning" boolean DEFAULT true NOT NULL,
    "alwaysMarkNsfw" boolean DEFAULT false NOT NULL,
    "autoSensitive" boolean DEFAULT false NOT NULL,
    "carefulBot" boolean DEFAULT false NOT NULL,
    "injectFeaturedNote" boolean DEFAULT true NOT NULL,
    "receiveAnnouncementEmail" boolean DEFAULT true NOT NULL,
    "pinnedPageId" character varying(32),
    "enableWordMute" boolean DEFAULT false NOT NULL,
    "mutedWords" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "hardMutedWords" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "mutedInstances" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notificationRecieveConfig" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "loggedInDates" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "userHost" character varying(128)
);

-- CONSTRAINT: user_profile user_profile_pkey
ALTER TABLE ONLY "public"."user_profile"
    ADD CONSTRAINT "user_profile_pkey" PRIMARY KEY ("userId");

-- INDEX: IDX_USERPROFILE_BIRTHDAY_DATE
CREATE INDEX "IDX_USERPROFILE_BIRTHDAY_DATE" ON "public"."user_profile" USING "btree" ("public"."get_birthday_date"(("birthday")::"text"));

-- INDEX: IDX_USER_PROFILE_DESCRIPTION_TRGM
CREATE INDEX "IDX_USER_PROFILE_DESCRIPTION_TRGM" ON "public"."user_profile" USING "gin" ("description" "gin_trgm_ops");

-- INDEX: IDX_USER_PROFILE_ENABLE_WORD_MUTE
CREATE INDEX "IDX_USER_PROFILE_ENABLE_WORD_MUTE" ON "public"."user_profile" USING "btree" ("enableWordMute");

-- INDEX: IDX_USER_PROFILE_USER_HOST
CREATE INDEX "IDX_USER_PROFILE_USER_HOST" ON "public"."user_profile" USING "btree" ("userHost");

-- INDEX: REL_6dc44f1ceb65b1e72bacef2ca2
CREATE UNIQUE INDEX "REL_6dc44f1ceb65b1e72bacef2ca2" ON "public"."user_profile" USING "btree" ("pinnedPageId");
--> statement-breakpoint
-- TABLE: user_publickey
CREATE TABLE "public"."user_publickey" (
    "userId" character varying(32) NOT NULL,
    "keyId" character varying(256) NOT NULL,
    "keyPem" character varying(4096) NOT NULL
);

-- CONSTRAINT: user_publickey user_publickey_pkey
ALTER TABLE ONLY "public"."user_publickey"
    ADD CONSTRAINT "user_publickey_pkey" PRIMARY KEY ("userId");

-- INDEX: IDX_USER_PUBLICKEY_KEY_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_PUBLICKEY_KEY_ID_UNIQUE" ON "public"."user_publickey" USING "btree" ("keyId");
--> statement-breakpoint
-- TABLE: user_security_key
CREATE TABLE "public"."user_security_key" (
    "id" character varying NOT NULL,
    "userId" character varying(32) NOT NULL,
    "name" character varying(30) NOT NULL,
    "publicKey" character varying NOT NULL,
    "counter" bigint DEFAULT 0 NOT NULL,
    "lastUsed" timestamp with time zone DEFAULT "now"() NOT NULL,
    "credentialDeviceType" character varying(32),
    "credentialBackedUp" boolean,
    "transports" character varying(32)[]
);

-- CONSTRAINT: user_security_key user_security_key_pkey
ALTER TABLE ONLY "public"."user_security_key"
    ADD CONSTRAINT "user_security_key_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_SECURITY_KEY_PUBLIC_KEY
CREATE INDEX "IDX_USER_SECURITY_KEY_PUBLIC_KEY" ON "public"."user_security_key" USING "btree" ("publicKey");

-- INDEX: IDX_USER_SECURITY_KEY_USER_ID
CREATE INDEX "IDX_USER_SECURITY_KEY_USER_ID" ON "public"."user_security_key" USING "btree" ("userId");
--> statement-breakpoint
-- TABLE: webhook
CREATE TABLE "public"."webhook" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "name" character varying(128) NOT NULL,
    "on" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "url" character varying(1024) NOT NULL,
    "secret" character varying(1024) NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "latestSentAt" timestamp with time zone,
    "latestStatus" integer
);

-- CONSTRAINT: webhook webhook_pkey
ALTER TABLE ONLY "public"."webhook"
    ADD CONSTRAINT "webhook_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_WEBHOOK_ACTIVE
CREATE INDEX "IDX_WEBHOOK_ACTIVE" ON "public"."webhook" USING "btree" ("active");

-- INDEX: IDX_WEBHOOK_ON
CREATE INDEX "IDX_WEBHOOK_ON" ON "public"."webhook" USING "btree" ("on");

-- INDEX: IDX_WEBHOOK_USER_ID
CREATE INDEX "IDX_WEBHOOK_USER_ID" ON "public"."webhook" USING "btree" ("userId");
--> statement-breakpoint
-- FK CONSTRAINT: abuse_report_notification_recipient abuse_report_notification_recipient_systemWebhookId_system_webh
ALTER TABLE ONLY "public"."abuse_report_notification_recipient"
    ADD CONSTRAINT "abuse_report_notification_recipient_systemWebhookId_system_webh" FOREIGN KEY ("systemWebhookId") REFERENCES "public"."system_webhook"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: abuse_report_notification_recipient abuse_report_notification_recipient_userId_user_id_fk
ALTER TABLE ONLY "public"."abuse_report_notification_recipient"
    ADD CONSTRAINT "abuse_report_notification_recipient_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: abuse_report_notification_recipient abuse_report_notification_recipient_userId_user_profile_userId_
ALTER TABLE ONLY "public"."abuse_report_notification_recipient"
    ADD CONSTRAINT "abuse_report_notification_recipient_userId_user_profile_userId_" FOREIGN KEY ("userId") REFERENCES "public"."user_profile"("userId") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: abuse_user_report abuse_user_report_assigneeId_user_id_fk
ALTER TABLE ONLY "public"."abuse_user_report"
    ADD CONSTRAINT "abuse_user_report_assigneeId_user_id_fk" FOREIGN KEY ("assigneeId") REFERENCES "public"."user"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: abuse_user_report abuse_user_report_reporterId_user_id_fk
ALTER TABLE ONLY "public"."abuse_user_report"
    ADD CONSTRAINT "abuse_user_report_reporterId_user_id_fk" FOREIGN KEY ("reporterId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: abuse_user_report abuse_user_report_targetUserId_user_id_fk
ALTER TABLE ONLY "public"."abuse_user_report"
    ADD CONSTRAINT "abuse_user_report_targetUserId_user_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: access_token access_token_userId_user_id_fk
ALTER TABLE ONLY "public"."access_token"
    ADD CONSTRAINT "access_token_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: announcement announcement_userId_user_id_fk
ALTER TABLE ONLY "public"."announcement"
    ADD CONSTRAINT "announcement_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: announcement_reaction announcement_reaction_announcementId_announcement_id_fk
ALTER TABLE ONLY "public"."announcement_reaction"
    ADD CONSTRAINT "announcement_reaction_announcementId_announcement_id_fk" FOREIGN KEY ("announcementId") REFERENCES "public"."announcement"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: announcement_reaction announcement_reaction_userId_user_id_fk
ALTER TABLE ONLY "public"."announcement_reaction"
    ADD CONSTRAINT "announcement_reaction_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: announcement_read announcement_read_announcementId_announcement_id_fk
ALTER TABLE ONLY "public"."announcement_read"
    ADD CONSTRAINT "announcement_read_announcementId_announcement_id_fk" FOREIGN KEY ("announcementId") REFERENCES "public"."announcement"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: announcement_read announcement_read_userId_user_id_fk
ALTER TABLE ONLY "public"."announcement_read"
    ADD CONSTRAINT "announcement_read_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: antenna antenna_userId_user_id_fk
ALTER TABLE ONLY "public"."antenna"
    ADD CONSTRAINT "antenna_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: antenna antenna_userListId_user_list_id_fk
ALTER TABLE ONLY "public"."antenna"
    ADD CONSTRAINT "antenna_userListId_user_list_id_fk" FOREIGN KEY ("userListId") REFERENCES "public"."user_list"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: blocking blocking_blockeeId_user_id_fk
ALTER TABLE ONLY "public"."blocking"
    ADD CONSTRAINT "blocking_blockeeId_user_id_fk" FOREIGN KEY ("blockeeId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: blocking blocking_blockerId_user_id_fk
ALTER TABLE ONLY "public"."blocking"
    ADD CONSTRAINT "blocking_blockerId_user_id_fk" FOREIGN KEY ("blockerId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: channel channel_bannerId_drive_file_id_fk
ALTER TABLE ONLY "public"."channel"
    ADD CONSTRAINT "channel_bannerId_drive_file_id_fk" FOREIGN KEY ("bannerId") REFERENCES "public"."drive_file"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: channel channel_userId_user_id_fk
ALTER TABLE ONLY "public"."channel"
    ADD CONSTRAINT "channel_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- FK CONSTRAINT: channel_favorite channel_favorite_channelId_channel_id_fk
ALTER TABLE ONLY "public"."channel_favorite"
    ADD CONSTRAINT "channel_favorite_channelId_channel_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."channel"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: channel_favorite channel_favorite_userId_user_id_fk
ALTER TABLE ONLY "public"."channel_favorite"
    ADD CONSTRAINT "channel_favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: channel_following channel_following_followeeId_channel_id_fk
ALTER TABLE ONLY "public"."channel_following"
    ADD CONSTRAINT "channel_following_followeeId_channel_id_fk" FOREIGN KEY ("followeeId") REFERENCES "public"."channel"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: channel_following channel_following_followerId_user_id_fk
ALTER TABLE ONLY "public"."channel_following"
    ADD CONSTRAINT "channel_following_followerId_user_id_fk" FOREIGN KEY ("followerId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: channel_muting channel_muting_channelId_channel_id_fk
ALTER TABLE ONLY "public"."channel_muting"
    ADD CONSTRAINT "channel_muting_channelId_channel_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."channel"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: channel_muting channel_muting_userId_user_id_fk
ALTER TABLE ONLY "public"."channel_muting"
    ADD CONSTRAINT "channel_muting_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: chat_approval chat_approval_otherId_user_id_fk
ALTER TABLE ONLY "public"."chat_approval"
    ADD CONSTRAINT "chat_approval_otherId_user_id_fk" FOREIGN KEY ("otherId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: chat_approval chat_approval_userId_user_id_fk
ALTER TABLE ONLY "public"."chat_approval"
    ADD CONSTRAINT "chat_approval_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: chat_message chat_message_fileId_drive_file_id_fk
ALTER TABLE ONLY "public"."chat_message"
    ADD CONSTRAINT "chat_message_fileId_drive_file_id_fk" FOREIGN KEY ("fileId") REFERENCES "public"."drive_file"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: chat_message chat_message_fromUserId_user_id_fk
ALTER TABLE ONLY "public"."chat_message"
    ADD CONSTRAINT "chat_message_fromUserId_user_id_fk" FOREIGN KEY ("fromUserId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: chat_message chat_message_toRoomId_chat_room_id_fk
ALTER TABLE ONLY "public"."chat_message"
    ADD CONSTRAINT "chat_message_toRoomId_chat_room_id_fk" FOREIGN KEY ("toRoomId") REFERENCES "public"."chat_room"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: chat_message chat_message_toUserId_user_id_fk
ALTER TABLE ONLY "public"."chat_message"
    ADD CONSTRAINT "chat_message_toUserId_user_id_fk" FOREIGN KEY ("toUserId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: chat_room chat_room_ownerId_user_id_fk
ALTER TABLE ONLY "public"."chat_room"
    ADD CONSTRAINT "chat_room_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: chat_room_invitation chat_room_invitation_roomId_chat_room_id_fk
ALTER TABLE ONLY "public"."chat_room_invitation"
    ADD CONSTRAINT "chat_room_invitation_roomId_chat_room_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chat_room"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: chat_room_invitation chat_room_invitation_userId_user_id_fk
ALTER TABLE ONLY "public"."chat_room_invitation"
    ADD CONSTRAINT "chat_room_invitation_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: chat_room_membership chat_room_membership_roomId_chat_room_id_fk
ALTER TABLE ONLY "public"."chat_room_membership"
    ADD CONSTRAINT "chat_room_membership_roomId_chat_room_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chat_room"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: chat_room_membership chat_room_membership_userId_user_id_fk
ALTER TABLE ONLY "public"."chat_room_membership"
    ADD CONSTRAINT "chat_room_membership_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: clip clip_userId_user_id_fk
ALTER TABLE ONLY "public"."clip"
    ADD CONSTRAINT "clip_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: clip_favorite clip_favorite_clipId_clip_id_fk
ALTER TABLE ONLY "public"."clip_favorite"
    ADD CONSTRAINT "clip_favorite_clipId_clip_id_fk" FOREIGN KEY ("clipId") REFERENCES "public"."clip"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: clip_favorite clip_favorite_userId_user_id_fk
ALTER TABLE ONLY "public"."clip_favorite"
    ADD CONSTRAINT "clip_favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: clip_note clip_note_clipId_clip_id_fk
ALTER TABLE ONLY "public"."clip_note"
    ADD CONSTRAINT "clip_note_clipId_clip_id_fk" FOREIGN KEY ("clipId") REFERENCES "public"."clip"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: clip_note clip_note_noteId_note_id_fk
ALTER TABLE ONLY "public"."clip_note"
    ADD CONSTRAINT "clip_note_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: drive_file drive_file_folderId_drive_folder_id_fk
ALTER TABLE ONLY "public"."drive_file"
    ADD CONSTRAINT "drive_file_folderId_drive_folder_id_fk" FOREIGN KEY ("folderId") REFERENCES "public"."drive_folder"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: drive_file drive_file_userId_user_id_fk
ALTER TABLE ONLY "public"."drive_file"
    ADD CONSTRAINT "drive_file_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- FK CONSTRAINT: drive_folder drive_folder_parentId_drive_folder_id_fk
ALTER TABLE ONLY "public"."drive_folder"
    ADD CONSTRAINT "drive_folder_parentId_drive_folder_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."drive_folder"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: drive_folder drive_folder_userId_user_id_fk
ALTER TABLE ONLY "public"."drive_folder"
    ADD CONSTRAINT "drive_folder_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: flash flash_userId_user_id_fk
ALTER TABLE ONLY "public"."flash"
    ADD CONSTRAINT "flash_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: flash_like flash_like_flashId_flash_id_fk
ALTER TABLE ONLY "public"."flash_like"
    ADD CONSTRAINT "flash_like_flashId_flash_id_fk" FOREIGN KEY ("flashId") REFERENCES "public"."flash"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: flash_like flash_like_userId_user_id_fk
ALTER TABLE ONLY "public"."flash_like"
    ADD CONSTRAINT "flash_like_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: follow_acceptance follow_acceptance_followeeId_user_id_fk
ALTER TABLE ONLY "public"."follow_acceptance"
    ADD CONSTRAINT "follow_acceptance_followeeId_user_id_fk" FOREIGN KEY ("followeeId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: follow_request follow_request_followeeId_user_id_fk
ALTER TABLE ONLY "public"."follow_request"
    ADD CONSTRAINT "follow_request_followeeId_user_id_fk" FOREIGN KEY ("followeeId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: follow_request follow_request_followerId_user_id_fk
ALTER TABLE ONLY "public"."follow_request"
    ADD CONSTRAINT "follow_request_followerId_user_id_fk" FOREIGN KEY ("followerId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: following following_followeeId_user_id_fk
ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_followeeId_user_id_fk" FOREIGN KEY ("followeeId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: following following_followerId_user_id_fk
ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_followerId_user_id_fk" FOREIGN KEY ("followerId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: gallery_like gallery_like_postId_gallery_post_id_fk
ALTER TABLE ONLY "public"."gallery_like"
    ADD CONSTRAINT "gallery_like_postId_gallery_post_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."gallery_post"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: gallery_like gallery_like_userId_user_id_fk
ALTER TABLE ONLY "public"."gallery_like"
    ADD CONSTRAINT "gallery_like_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: gallery_post gallery_post_userId_user_id_fk
ALTER TABLE ONLY "public"."gallery_post"
    ADD CONSTRAINT "gallery_post_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: hashtag_user hashtag_user_hashtagId_hashtag_id_fk
ALTER TABLE ONLY "public"."hashtag_user"
    ADD CONSTRAINT "hashtag_user_hashtagId_hashtag_id_fk" FOREIGN KEY ("hashtagId") REFERENCES "public"."hashtag"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: hashtag_user hashtag_user_userId_user_id_fk
ALTER TABLE ONLY "public"."hashtag_user"
    ADD CONSTRAINT "hashtag_user_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: meta meta_rootUserId_user_id_fk
ALTER TABLE ONLY "public"."meta"
    ADD CONSTRAINT "meta_rootUserId_user_id_fk" FOREIGN KEY ("rootUserId") REFERENCES "public"."user"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- FK CONSTRAINT: moderation_log moderation_log_userId_user_id_fk
ALTER TABLE ONLY "public"."moderation_log"
    ADD CONSTRAINT "moderation_log_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: muting muting_muteeId_user_id_fk
ALTER TABLE ONLY "public"."muting"
    ADD CONSTRAINT "muting_muteeId_user_id_fk" FOREIGN KEY ("muteeId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: muting muting_muterId_user_id_fk
ALTER TABLE ONLY "public"."muting"
    ADD CONSTRAINT "muting_muterId_user_id_fk" FOREIGN KEY ("muterId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: note note_channelId_channel_id_fk
ALTER TABLE ONLY "public"."note"
    ADD CONSTRAINT "note_channelId_channel_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."channel"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: note note_userId_user_id_fk
ALTER TABLE ONLY "public"."note"
    ADD CONSTRAINT "note_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: note_draft note_draft_userId_user_id_fk
ALTER TABLE ONLY "public"."note_draft"
    ADD CONSTRAINT "note_draft_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: note_favorite note_favorite_noteId_note_id_fk
ALTER TABLE ONLY "public"."note_favorite"
    ADD CONSTRAINT "note_favorite_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: note_favorite note_favorite_userId_user_id_fk
ALTER TABLE ONLY "public"."note_favorite"
    ADD CONSTRAINT "note_favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: note_reaction note_reaction_noteId_note_id_fk
ALTER TABLE ONLY "public"."note_reaction"
    ADD CONSTRAINT "note_reaction_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: note_reaction note_reaction_userId_user_id_fk
ALTER TABLE ONLY "public"."note_reaction"
    ADD CONSTRAINT "note_reaction_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: note_thread_muting note_thread_muting_userId_user_id_fk
ALTER TABLE ONLY "public"."note_thread_muting"
    ADD CONSTRAINT "note_thread_muting_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: page page_eyeCatchingImageId_drive_file_id_fk
ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_eyeCatchingImageId_drive_file_id_fk" FOREIGN KEY ("eyeCatchingImageId") REFERENCES "public"."drive_file"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: page page_userId_user_id_fk
ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: page_like page_like_pageId_page_id_fk
ALTER TABLE ONLY "public"."page_like"
    ADD CONSTRAINT "page_like_pageId_page_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."page"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: page_like page_like_userId_user_id_fk
ALTER TABLE ONLY "public"."page_like"
    ADD CONSTRAINT "page_like_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: password_reset_request password_reset_request_userId_user_id_fk
ALTER TABLE ONLY "public"."password_reset_request"
    ADD CONSTRAINT "password_reset_request_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: poll poll_noteId_note_id_fk
ALTER TABLE ONLY "public"."poll"
    ADD CONSTRAINT "poll_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: poll_vote poll_vote_noteId_note_id_fk
ALTER TABLE ONLY "public"."poll_vote"
    ADD CONSTRAINT "poll_vote_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: poll_vote poll_vote_userId_user_id_fk
ALTER TABLE ONLY "public"."poll_vote"
    ADD CONSTRAINT "poll_vote_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: promo_note promo_note_noteId_note_id_fk
ALTER TABLE ONLY "public"."promo_note"
    ADD CONSTRAINT "promo_note_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: promo_read promo_read_noteId_note_id_fk
ALTER TABLE ONLY "public"."promo_read"
    ADD CONSTRAINT "promo_read_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: promo_read promo_read_userId_user_id_fk
ALTER TABLE ONLY "public"."promo_read"
    ADD CONSTRAINT "promo_read_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: queue_outbox queue_outbox_coordinatorId_queue_outbox_id_fk
ALTER TABLE ONLY "public"."queue_outbox"
    ADD CONSTRAINT "queue_outbox_coordinatorId_queue_outbox_id_fk" FOREIGN KEY ("coordinatorId") REFERENCES "public"."queue_outbox"("id") ON DELETE RESTRICT;
--> statement-breakpoint
-- FK CONSTRAINT: registration_ticket registration_ticket_createdById_user_id_fk
ALTER TABLE ONLY "public"."registration_ticket"
    ADD CONSTRAINT "registration_ticket_createdById_user_id_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: registration_ticket registration_ticket_usedById_user_id_fk
ALTER TABLE ONLY "public"."registration_ticket"
    ADD CONSTRAINT "registration_ticket_usedById_user_id_fk" FOREIGN KEY ("usedById") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: registry_item registry_item_userId_user_id_fk
ALTER TABLE ONLY "public"."registry_item"
    ADD CONSTRAINT "registry_item_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: renote_muting renote_muting_muteeId_user_id_fk
ALTER TABLE ONLY "public"."renote_muting"
    ADD CONSTRAINT "renote_muting_muteeId_user_id_fk" FOREIGN KEY ("muteeId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: renote_muting renote_muting_muterId_user_id_fk
ALTER TABLE ONLY "public"."renote_muting"
    ADD CONSTRAINT "renote_muting_muterId_user_id_fk" FOREIGN KEY ("muterId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: role_assignment role_assignment_roleId_role_id_fk
ALTER TABLE ONLY "public"."role_assignment"
    ADD CONSTRAINT "role_assignment_roleId_role_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."role"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: role_assignment role_assignment_userId_user_id_fk
ALTER TABLE ONLY "public"."role_assignment"
    ADD CONSTRAINT "role_assignment_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: signin signin_userId_user_id_fk
ALTER TABLE ONLY "public"."signin"
    ADD CONSTRAINT "signin_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: sw_subscription sw_subscription_userId_user_id_fk
ALTER TABLE ONLY "public"."sw_subscription"
    ADD CONSTRAINT "sw_subscription_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: system_account system_account_userId_user_id_fk
ALTER TABLE ONLY "public"."system_account"
    ADD CONSTRAINT "system_account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: user user_avatarId_drive_file_id_fk
ALTER TABLE ONLY "public"."user"
    ADD CONSTRAINT "user_avatarId_drive_file_id_fk" FOREIGN KEY ("avatarId") REFERENCES "public"."drive_file"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: user user_bannerId_drive_file_id_fk
ALTER TABLE ONLY "public"."user"
    ADD CONSTRAINT "user_bannerId_drive_file_id_fk" FOREIGN KEY ("bannerId") REFERENCES "public"."drive_file"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- FK CONSTRAINT: user_keypair user_keypair_userId_user_id_fk
ALTER TABLE ONLY "public"."user_keypair"
    ADD CONSTRAINT "user_keypair_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: user_list user_list_userId_user_id_fk
ALTER TABLE ONLY "public"."user_list"
    ADD CONSTRAINT "user_list_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: user_list_favorite user_list_favorite_userId_user_id_fk
ALTER TABLE ONLY "public"."user_list_favorite"
    ADD CONSTRAINT "user_list_favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: user_list_favorite user_list_favorite_userListId_user_list_id_fk
ALTER TABLE ONLY "public"."user_list_favorite"
    ADD CONSTRAINT "user_list_favorite_userListId_user_list_id_fk" FOREIGN KEY ("userListId") REFERENCES "public"."user_list"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: user_list_membership user_list_membership_userId_user_id_fk
ALTER TABLE ONLY "public"."user_list_membership"
    ADD CONSTRAINT "user_list_membership_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: user_list_membership user_list_membership_userListId_user_list_id_fk
ALTER TABLE ONLY "public"."user_list_membership"
    ADD CONSTRAINT "user_list_membership_userListId_user_list_id_fk" FOREIGN KEY ("userListId") REFERENCES "public"."user_list"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: user_memo user_memo_targetUserId_user_id_fk
ALTER TABLE ONLY "public"."user_memo"
    ADD CONSTRAINT "user_memo_targetUserId_user_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: user_memo user_memo_userId_user_id_fk
ALTER TABLE ONLY "public"."user_memo"
    ADD CONSTRAINT "user_memo_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: user_note_pining user_note_pining_noteId_note_id_fk
ALTER TABLE ONLY "public"."user_note_pining"
    ADD CONSTRAINT "user_note_pining_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: user_note_pining user_note_pining_userId_user_id_fk
ALTER TABLE ONLY "public"."user_note_pining"
    ADD CONSTRAINT "user_note_pining_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: user_profile user_profile_pinnedPageId_page_id_fk
ALTER TABLE ONLY "public"."user_profile"
    ADD CONSTRAINT "user_profile_pinnedPageId_page_id_fk" FOREIGN KEY ("pinnedPageId") REFERENCES "public"."page"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: user_profile user_profile_userId_user_id_fk
ALTER TABLE ONLY "public"."user_profile"
    ADD CONSTRAINT "user_profile_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: user_publickey user_publickey_userId_user_id_fk
ALTER TABLE ONLY "public"."user_publickey"
    ADD CONSTRAINT "user_publickey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: user_security_key user_security_key_userId_user_id_fk
ALTER TABLE ONLY "public"."user_security_key"
    ADD CONSTRAINT "user_security_key_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- FK CONSTRAINT: webhook webhook_userId_user_id_fk
ALTER TABLE ONLY "public"."webhook"
    ADD CONSTRAINT "webhook_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
--> statement-breakpoint
-- TABLE DATA: cache_version
INSERT INTO "public"."cache_version" ("key", "version") VALUES ('roles', 0);

-- SEQUENCE SET: __chart__active_users_id_seq
SELECT pg_catalog.setval('"public"."__chart__active_users_id_seq"', 1, false);

-- SEQUENCE SET: __chart__ap_request_id_seq
SELECT pg_catalog.setval('"public"."__chart__ap_request_id_seq"', 1, false);

-- SEQUENCE SET: __chart__drive_id_seq
SELECT pg_catalog.setval('"public"."__chart__drive_id_seq"', 1, false);

-- SEQUENCE SET: __chart__federation_id_seq
SELECT pg_catalog.setval('"public"."__chart__federation_id_seq"', 1, false);

-- SEQUENCE SET: __chart__instance_id_seq
SELECT pg_catalog.setval('"public"."__chart__instance_id_seq"', 1, false);

-- SEQUENCE SET: __chart__notes_id_seq
SELECT pg_catalog.setval('"public"."__chart__notes_id_seq"', 1, false);

-- SEQUENCE SET: __chart__per_user_drive_id_seq
SELECT pg_catalog.setval('"public"."__chart__per_user_drive_id_seq"', 1, false);

-- SEQUENCE SET: __chart__per_user_following_id_seq
SELECT pg_catalog.setval('"public"."__chart__per_user_following_id_seq"', 1, false);

-- SEQUENCE SET: __chart__per_user_notes_id_seq
SELECT pg_catalog.setval('"public"."__chart__per_user_notes_id_seq"', 1, false);

-- SEQUENCE SET: __chart__per_user_pv_id_seq
SELECT pg_catalog.setval('"public"."__chart__per_user_pv_id_seq"', 1, false);

-- SEQUENCE SET: __chart__per_user_reaction_id_seq
SELECT pg_catalog.setval('"public"."__chart__per_user_reaction_id_seq"', 1, false);

-- SEQUENCE SET: __chart__users_id_seq
SELECT pg_catalog.setval('"public"."__chart__users_id_seq"', 1, false);

-- SEQUENCE SET: __chart_day__active_users_id_seq
SELECT pg_catalog.setval('"public"."__chart_day__active_users_id_seq"', 1, false);

-- SEQUENCE SET: __chart_day__ap_request_id_seq
SELECT pg_catalog.setval('"public"."__chart_day__ap_request_id_seq"', 1, false);

-- SEQUENCE SET: __chart_day__drive_id_seq
SELECT pg_catalog.setval('"public"."__chart_day__drive_id_seq"', 1, false);

-- SEQUENCE SET: __chart_day__federation_id_seq
SELECT pg_catalog.setval('"public"."__chart_day__federation_id_seq"', 1, false);

-- SEQUENCE SET: __chart_day__instance_id_seq
SELECT pg_catalog.setval('"public"."__chart_day__instance_id_seq"', 1, false);

-- SEQUENCE SET: __chart_day__notes_id_seq
SELECT pg_catalog.setval('"public"."__chart_day__notes_id_seq"', 1, false);

-- SEQUENCE SET: __chart_day__per_user_drive_id_seq
SELECT pg_catalog.setval('"public"."__chart_day__per_user_drive_id_seq"', 1, false);

-- SEQUENCE SET: __chart_day__per_user_following_id_seq
SELECT pg_catalog.setval('"public"."__chart_day__per_user_following_id_seq"', 1, false);

-- SEQUENCE SET: __chart_day__per_user_notes_id_seq
SELECT pg_catalog.setval('"public"."__chart_day__per_user_notes_id_seq"', 1, false);

-- SEQUENCE SET: __chart_day__per_user_pv_id_seq
SELECT pg_catalog.setval('"public"."__chart_day__per_user_pv_id_seq"', 1, false);

-- SEQUENCE SET: __chart_day__per_user_reaction_id_seq
SELECT pg_catalog.setval('"public"."__chart_day__per_user_reaction_id_seq"', 1, false);

-- SEQUENCE SET: __chart_day__users_id_seq
SELECT pg_catalog.setval('"public"."__chart_day__users_id_seq"', 1, false);

-- SEQUENCE SET: user_ip_id_seq
SELECT pg_catalog.setval('"public"."user_ip_id_seq"', 1, false);
--> statement-breakpoint
-- TRIGGER: role_assignment TRG_role_assignment_bump_cache_version
CREATE TRIGGER "TRG_role_assignment_bump_cache_version" AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON "public"."role_assignment" FOR EACH STATEMENT EXECUTE FUNCTION "public"."bump_roles_cache_version"();

-- TRIGGER: role TRG_role_bump_cache_version
CREATE TRIGGER "TRG_role_bump_cache_version" AFTER INSERT OR DELETE OR UPDATE OR TRUNCATE ON "public"."role" FOR EACH STATEMENT EXECUTE FUNCTION "public"."bump_roles_cache_version"();
