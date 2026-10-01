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
