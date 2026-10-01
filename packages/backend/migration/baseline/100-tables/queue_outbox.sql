-- TABLE: queue_outbox
CREATE TABLE "public"."queue_outbox" (
    "id" character varying(32) NOT NULL,
    "queue" character varying(64) NOT NULL,
    "name" character varying(128) NOT NULL,
    "data" "jsonb" NOT NULL,
    "opts" "jsonb" NOT NULL,
    "createdAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "kind" character varying(32) DEFAULT 'job'::character varying NOT NULL,
    "state" character varying(32) DEFAULT 'ready'::character varying NOT NULL,
    "coordinatorId" character varying(32),
    "externalJobId" character varying(128),
    "availableAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "leaseToken" character varying(64),
    "leaseExpiresAt" timestamp with time zone,
    "pollIntervalMs" integer DEFAULT 1000 NOT NULL,
    "deadLetterReason" character varying(32),
    "lastError" "jsonb",
    "revision" integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL
);

-- CONSTRAINT: queue_outbox queue_outbox_pkey
ALTER TABLE ONLY "public"."queue_outbox"
    ADD CONSTRAINT "queue_outbox_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_QUEUE_OUTBOX_COORDINATOR_ID
CREATE INDEX "IDX_QUEUE_OUTBOX_COORDINATOR_ID" ON "public"."queue_outbox" USING "btree" ("coordinatorId");

-- INDEX: IDX_QUEUE_OUTBOX_STATE_AVAILABLE_AT
CREATE INDEX "IDX_QUEUE_OUTBOX_STATE_AVAILABLE_AT" ON "public"."queue_outbox" USING "btree" ("state", "availableAt", "createdAt");

-- INDEX: IDX_QUEUE_OUTBOX_STATE_ID
CREATE INDEX "IDX_QUEUE_OUTBOX_STATE_ID" ON "public"."queue_outbox" USING "btree" ("state", "id");
