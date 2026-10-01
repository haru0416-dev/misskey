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
