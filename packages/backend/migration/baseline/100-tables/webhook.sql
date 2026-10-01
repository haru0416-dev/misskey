-- TABLE: webhook
CREATE TABLE "public"."webhook" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "name" character varying(128) NOT NULL,
    "on" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "url" character varying(1024) NOT NULL,
    "secret" character varying(1024) NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "latestSentAt" timestamp with time zone,
    "latestStatus" integer
);

-- CONSTRAINT: webhook webhook_pkey
ALTER TABLE ONLY "public"."webhook"
    ADD CONSTRAINT "webhook_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_WEBHOOK_ACTIVE
CREATE INDEX "IDX_WEBHOOK_ACTIVE" ON "public"."webhook" USING "btree" ("active");

-- INDEX: IDX_WEBHOOK_ON
CREATE INDEX "IDX_WEBHOOK_ON" ON "public"."webhook" USING "btree" ("on");

-- INDEX: IDX_WEBHOOK_USER_ID
CREATE INDEX "IDX_WEBHOOK_USER_ID" ON "public"."webhook" USING "btree" ("userId");
