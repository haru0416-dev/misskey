-- TABLE: channel_muting
CREATE TABLE "public"."channel_muting" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "channelId" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone
);

-- CONSTRAINT: channel_muting channel_muting_pkey
ALTER TABLE ONLY "public"."channel_muting"
    ADD CONSTRAINT "channel_muting_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHANNEL_MUTING_CHANNEL_ID
CREATE INDEX "IDX_CHANNEL_MUTING_CHANNEL_ID" ON "public"."channel_muting" USING "btree" ("channelId");

-- INDEX: IDX_CHANNEL_MUTING_EXPIRES_AT
CREATE INDEX "IDX_CHANNEL_MUTING_EXPIRES_AT" ON "public"."channel_muting" USING "btree" ("expiresAt");

-- INDEX: IDX_CHANNEL_MUTING_USER_ID
CREATE INDEX "IDX_CHANNEL_MUTING_USER_ID" ON "public"."channel_muting" USING "btree" ("userId");

-- INDEX: IDX_CHANNEL_MUTING_USER_ID_CHANNEL_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CHANNEL_MUTING_USER_ID_CHANNEL_ID_UNIQUE" ON "public"."channel_muting" USING "btree" ("userId", "channelId");
