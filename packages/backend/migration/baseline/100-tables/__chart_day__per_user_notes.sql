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
