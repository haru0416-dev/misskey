-- TABLE: __chart_day__active_users
CREATE TABLE "public"."__chart_day__active_users" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___readWrite" integer DEFAULT 0 NOT NULL,
    "unique_temp___read" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___read" integer DEFAULT 0 NOT NULL,
    "unique_temp___write" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___write" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredWithinWeek" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__active_users_unique_temp___registeredWith_not_null" NOT NULL,
    "___registeredWithinWeek" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredWithinMonth" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__active_users_unique_temp___registeredWit_not_null1" NOT NULL,
    "___registeredWithinMonth" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredWithinYear" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__active_users_unique_temp___registeredWit_not_null2" NOT NULL,
    "___registeredWithinYear" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredOutsideWeek" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__active_users_unique_temp___registeredOuts_not_null" NOT NULL,
    "___registeredOutsideWeek" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredOutsideMonth" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__active_users_unique_temp___registeredOut_not_null1" NOT NULL,
    "___registeredOutsideMonth" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredOutsideYear" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__active_users_unique_temp___registeredOut_not_null2" NOT NULL,
    "___registeredOutsideYear" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart_day__active_users_id_seq
CREATE SEQUENCE "public"."__chart_day__active_users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__active_users_id_seq
ALTER SEQUENCE "public"."__chart_day__active_users_id_seq" OWNED BY "public"."__chart_day__active_users"."id";

-- DEFAULT: __chart_day__active_users id
ALTER TABLE ONLY "public"."__chart_day__active_users" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__active_users_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__active_users PK_b1790489b14f005ae8f404f5795
ALTER TABLE ONLY "public"."__chart_day__active_users"
    ADD CONSTRAINT "PK_b1790489b14f005ae8f404f5795" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__active_users UQ_d5954f3df5e5e3bdfc3c03f3906
ALTER TABLE ONLY "public"."__chart_day__active_users"
    ADD CONSTRAINT "UQ_d5954f3df5e5e3bdfc3c03f3906" UNIQUE ("date");

-- INDEX: IDX_CHART_DAY_ACTIVE_USERS_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_ACTIVE_USERS_DATE_UNIQUE" ON "public"."__chart_day__active_users" USING "btree" ("date");
