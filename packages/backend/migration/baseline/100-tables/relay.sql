-- TABLE: relay
CREATE TABLE "public"."relay" (
    "id" character varying(32) NOT NULL,
    "inbox" character varying(512) NOT NULL,
    "status" "public"."relay_status_enum" NOT NULL
);

-- CONSTRAINT: relay relay_pkey
ALTER TABLE ONLY "public"."relay"
    ADD CONSTRAINT "relay_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_RELAY_INBOX_UNIQUE
CREATE UNIQUE INDEX "IDX_RELAY_INBOX_UNIQUE" ON "public"."relay" USING "btree" ("inbox");

-- INDEX: IDX_relay_status
CREATE INDEX "IDX_relay_status" ON "public"."relay" USING "btree" ("status");
