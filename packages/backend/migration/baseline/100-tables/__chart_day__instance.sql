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
