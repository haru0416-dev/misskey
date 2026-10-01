-- TABLE: __chart_day__per_user_pv
CREATE TABLE "public"."__chart_day__per_user_pv" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "unique_temp___upv_user" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___upv_user" smallint DEFAULT '0'::smallint NOT NULL,
    "___pv_user" smallint DEFAULT '0'::smallint NOT NULL,
    "unique_temp___upv_visitor" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___upv_visitor" smallint DEFAULT '0'::smallint NOT NULL,
    "___pv_visitor" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart_day__per_user_pv_id_seq
CREATE SEQUENCE "public"."__chart_day__per_user_pv_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__per_user_pv_id_seq
ALTER SEQUENCE "public"."__chart_day__per_user_pv_id_seq" OWNED BY "public"."__chart_day__per_user_pv"."id";

-- DEFAULT: __chart_day__per_user_pv id
ALTER TABLE ONLY "public"."__chart_day__per_user_pv" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__per_user_pv_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__per_user_pv PK_0085d7542f6772e99b9dcfb0a9c
ALTER TABLE ONLY "public"."__chart_day__per_user_pv"
    ADD CONSTRAINT "PK_0085d7542f6772e99b9dcfb0a9c" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__per_user_pv UQ_f221e45cfac5bea0ce0f3149fbb
ALTER TABLE ONLY "public"."__chart_day__per_user_pv"
    ADD CONSTRAINT "UQ_f221e45cfac5bea0ce0f3149fbb" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_DAY_PER_USER_PV_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_PER_USER_PV_DATE_GROUP_UNIQUE" ON "public"."__chart_day__per_user_pv" USING "btree" ("date", "group");
