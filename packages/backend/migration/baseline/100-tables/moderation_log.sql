-- TABLE: moderation_log
CREATE TABLE "public"."moderation_log" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "type" character varying(128) NOT NULL,
    "info" "jsonb" NOT NULL
);

-- CONSTRAINT: moderation_log moderation_log_pkey
ALTER TABLE ONLY "public"."moderation_log"
    ADD CONSTRAINT "moderation_log_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_MODERATION_LOG_TYPE_ID
CREATE INDEX "IDX_MODERATION_LOG_TYPE_ID" ON "public"."moderation_log" USING "btree" ("type", "id");

-- INDEX: IDX_MODERATION_LOG_USER_ID
CREATE INDEX "IDX_MODERATION_LOG_USER_ID" ON "public"."moderation_log" USING "btree" ("userId");

-- INDEX: IDX_MODERATION_LOG_USER_ID_ID
CREATE INDEX "IDX_MODERATION_LOG_USER_ID_ID" ON "public"."moderation_log" USING "btree" ("userId", "id");
