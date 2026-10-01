-- TABLE: channel_favorite
CREATE TABLE "public"."channel_favorite" (
    "id" character varying(32) NOT NULL,
    "channelId" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL
);

-- CONSTRAINT: channel_favorite channel_favorite_pkey
ALTER TABLE ONLY "public"."channel_favorite"
    ADD CONSTRAINT "channel_favorite_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHANNEL_FAVORITE_CHANNEL_ID
CREATE INDEX "IDX_CHANNEL_FAVORITE_CHANNEL_ID" ON "public"."channel_favorite" USING "btree" ("channelId");

-- INDEX: IDX_CHANNEL_FAVORITE_USER_ID
CREATE INDEX "IDX_CHANNEL_FAVORITE_USER_ID" ON "public"."channel_favorite" USING "btree" ("userId");

-- INDEX: IDX_CHANNEL_FAVORITE_USER_ID_CHANNEL_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CHANNEL_FAVORITE_USER_ID_CHANNEL_ID_UNIQUE" ON "public"."channel_favorite" USING "btree" ("userId", "channelId");
