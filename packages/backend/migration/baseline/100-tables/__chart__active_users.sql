-- TABLE: __chart__active_users
CREATE TABLE "public"."__chart__active_users" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___readWrite" integer DEFAULT 0 NOT NULL,
    "unique_temp___read" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___read" integer DEFAULT 0 NOT NULL,
    "unique_temp___write" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___write" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredWithinWeek" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart__active_users_unique_temp___registeredWithinWe_not_null" NOT NULL,
    "___registeredWithinWeek" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredWithinMonth" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart__active_users_unique_temp___registeredWithinMo_not_null" NOT NULL,
    "___registeredWithinMonth" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredWithinYear" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart__active_users_unique_temp___registeredWithinYe_not_null" NOT NULL,
    "___registeredWithinYear" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredOutsideWeek" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart__active_users_unique_temp___registeredOutsideW_not_null" NOT NULL,
    "___registeredOutsideWeek" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredOutsideMonth" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart__active_users_unique_temp___registeredOutsideM_not_null" NOT NULL,
    "___registeredOutsideMonth" integer DEFAULT 0 NOT NULL,
    "unique_temp___registeredOutsideYear" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart__active_users_unique_temp___registeredOutsideY_not_null" NOT NULL,
    "___registeredOutsideYear" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart__active_users_id_seq
CREATE SEQUENCE "public"."__chart__active_users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__active_users_id_seq
ALTER SEQUENCE "public"."__chart__active_users_id_seq" OWNED BY "public"."__chart__active_users"."id";

-- DEFAULT: __chart__active_users id
ALTER TABLE ONLY "public"."__chart__active_users" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__active_users_id_seq"'::"regclass");

-- CONSTRAINT: __chart__active_users PK_317237a9f733b970604a11e314f
ALTER TABLE ONLY "public"."__chart__active_users"
    ADD CONSTRAINT "PK_317237a9f733b970604a11e314f" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__active_users UQ_0ad37b7ef50f4ddc84363d7ccca
ALTER TABLE ONLY "public"."__chart__active_users"
    ADD CONSTRAINT "UQ_0ad37b7ef50f4ddc84363d7ccca" UNIQUE ("date");

-- INDEX: IDX_CHART_HOUR_ACTIVE_USERS_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_ACTIVE_USERS_DATE_UNIQUE" ON "public"."__chart__active_users" USING "btree" ("date");
