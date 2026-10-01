-- TABLE: __chart__federation
CREATE TABLE "public"."__chart__federation" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "unique_temp___deliveredInstances" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
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

-- SEQUENCE: __chart__federation_id_seq
CREATE SEQUENCE "public"."__chart__federation_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__federation_id_seq
ALTER SEQUENCE "public"."__chart__federation_id_seq" OWNED BY "public"."__chart__federation"."id";

-- DEFAULT: __chart__federation id
ALTER TABLE ONLY "public"."__chart__federation" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__federation_id_seq"'::"regclass");

-- CONSTRAINT: __chart__federation PK_b39dcd31a0fe1a7757e348e85fd
ALTER TABLE ONLY "public"."__chart__federation"
    ADD CONSTRAINT "PK_b39dcd31a0fe1a7757e348e85fd" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__federation UQ_36cb699c49580d4e6c2e6159f97
ALTER TABLE ONLY "public"."__chart__federation"
    ADD CONSTRAINT "UQ_36cb699c49580d4e6c2e6159f97" UNIQUE ("date");

-- INDEX: IDX_CHART_HOUR_FEDERATION_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_FEDERATION_DATE_UNIQUE" ON "public"."__chart__federation" USING "btree" ("date");
