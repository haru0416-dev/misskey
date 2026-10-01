-- TABLE: retention_aggregation
CREATE TABLE "public"."retention_aggregation" (
    "id" character varying(32) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "dateKey" character varying(512) NOT NULL,
    "userIds" character varying(32)[] NOT NULL,
    "usersCount" integer NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);

-- CONSTRAINT: retention_aggregation retention_aggregation_pkey
ALTER TABLE ONLY "public"."retention_aggregation"
    ADD CONSTRAINT "retention_aggregation_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_RETENTION_AGGREGATION_CREATED_AT
CREATE INDEX "IDX_RETENTION_AGGREGATION_CREATED_AT" ON "public"."retention_aggregation" USING "btree" ("createdAt");

-- INDEX: IDX_RETENTION_AGGREGATION_DATE_KEY_UNIQUE
CREATE UNIQUE INDEX "IDX_RETENTION_AGGREGATION_DATE_KEY_UNIQUE" ON "public"."retention_aggregation" USING "btree" ("dateKey");
