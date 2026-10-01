-- TABLE: system_webhook
CREATE TABLE "public"."system_webhook" (
    "id" character varying(32) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "latestSentAt" timestamp with time zone,
    "latestStatus" integer,
    "name" character varying(255) NOT NULL,
    "on" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "url" character varying(1024) NOT NULL,
    "secret" character varying(1024) NOT NULL
);

-- CONSTRAINT: system_webhook system_webhook_pkey
ALTER TABLE ONLY "public"."system_webhook"
    ADD CONSTRAINT "system_webhook_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_system_webhook_isActive
CREATE INDEX "IDX_system_webhook_isActive" ON "public"."system_webhook" USING "btree" ("isActive");

-- INDEX: IDX_system_webhook_on
CREATE INDEX "IDX_system_webhook_on" ON "public"."system_webhook" USING "gin" ("on");
