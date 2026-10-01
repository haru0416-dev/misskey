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
