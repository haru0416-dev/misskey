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
