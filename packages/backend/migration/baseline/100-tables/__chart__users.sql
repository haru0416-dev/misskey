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
