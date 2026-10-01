-- TABLE: __chart_day__federation
CREATE TABLE "public"."__chart_day__federation" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "unique_temp___deliveredInstances" character varying[] DEFAULT '{}'::character varying[] CONSTRAINT "__chart_day__federation_unique_temp___deliveredInstanc_not_null" NOT NULL,
    "___deliveredInstances" smallint DEFAULT '0'::smallint NOT NULL,
    "unique_temp___inboxInstances" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___inboxInstances" smallint DEFAULT '0'::smallint NOT NULL,
    "unique_temp___stalled" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "___stalled" smallint DEFAULT '0'::smallint NOT NULL,
    "___sub" smallint DEFAULT '0'::smallint NOT NULL,
    "___pub" smallint DEFAULT '0'::smallint NOT NULL,
    "___pubsub" smallint DEFAULT '0'::smallint NOT NULL,
    "___subActive" smallint DEFAULT '0'::smallint NOT NULL,
    "___pubActive" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart_day__federation_id_seq
CREATE SEQUENCE "public"."__chart_day__federation_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__federation_id_seq
ALTER SEQUENCE "public"."__chart_day__federation_id_seq" OWNED BY "public"."__chart_day__federation"."id";

-- DEFAULT: __chart_day__federation id
ALTER TABLE ONLY "public"."__chart_day__federation" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__federation_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__federation PK_7ca721c769f31698e0e1331e8e6
ALTER TABLE ONLY "public"."__chart_day__federation"
    ADD CONSTRAINT "PK_7ca721c769f31698e0e1331e8e6" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__federation UQ_617a8fe225a6e701d89e02d2c74
ALTER TABLE ONLY "public"."__chart_day__federation"
    ADD CONSTRAINT "UQ_617a8fe225a6e701d89e02d2c74" UNIQUE ("date");

-- INDEX: IDX_CHART_DAY_FEDERATION_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_FEDERATION_DATE_UNIQUE" ON "public"."__chart_day__federation" USING "btree" ("date");
