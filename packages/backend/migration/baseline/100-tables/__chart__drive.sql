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
