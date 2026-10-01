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
