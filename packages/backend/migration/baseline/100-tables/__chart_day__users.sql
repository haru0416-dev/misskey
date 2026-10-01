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
