-- TABLE: sw_subscription
CREATE TABLE "public"."sw_subscription" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "endpoint" character varying(512) NOT NULL,
    "auth" character varying(256) NOT NULL,
    "publickey" character varying(128) NOT NULL,
    "sendReadMessage" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: sw_subscription sw_subscription_pkey
ALTER TABLE ONLY "public"."sw_subscription"
    ADD CONSTRAINT "sw_subscription_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_SW_SUBSCRIPTION_ENDPOINT
CREATE INDEX "IDX_SW_SUBSCRIPTION_ENDPOINT" ON "public"."sw_subscription" USING "btree" ("endpoint");

-- INDEX: IDX_SW_SUBSCRIPTION_USER_ID_ENDPOINT_UNIQUE
CREATE UNIQUE INDEX "IDX_SW_SUBSCRIPTION_USER_ID_ENDPOINT_UNIQUE" ON "public"."sw_subscription" USING "btree" ("userId", "endpoint");
