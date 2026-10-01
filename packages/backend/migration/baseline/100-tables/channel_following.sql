-- TABLE: channel_following
CREATE TABLE "public"."channel_following" (
    "id" character varying(32) NOT NULL,
    "followeeId" character varying(32) NOT NULL,
    "followerId" character varying(32) NOT NULL
);

-- CONSTRAINT: channel_following channel_following_pkey
ALTER TABLE ONLY "public"."channel_following"
    ADD CONSTRAINT "channel_following_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHANNEL_FOLLOWING_FOLLOWEE_ID
CREATE INDEX "IDX_CHANNEL_FOLLOWING_FOLLOWEE_ID" ON "public"."channel_following" USING "btree" ("followeeId");

-- INDEX: IDX_CHANNEL_FOLLOWING_FOLLOWER_ID
CREATE INDEX "IDX_CHANNEL_FOLLOWING_FOLLOWER_ID" ON "public"."channel_following" USING "btree" ("followerId");

-- INDEX: IDX_CHANNEL_FOLLOWING_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CHANNEL_FOLLOWING_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE" ON "public"."channel_following" USING "btree" ("followerId", "followeeId");
