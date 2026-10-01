-- TABLE: following
CREATE TABLE "public"."following" (
    "id" character varying(32) NOT NULL,
    "followeeId" character varying(32) NOT NULL,
    "followerId" character varying(32) NOT NULL,
    "isFollowerHibernated" boolean DEFAULT false NOT NULL,
    "withReplies" boolean DEFAULT false NOT NULL,
    "notify" character varying(32),
    "followerHost" character varying(128),
    "followerInbox" character varying(512),
    "followerSharedInbox" character varying(512),
    "followeeHost" character varying(128),
    "followeeInbox" character varying(512),
    "followeeSharedInbox" character varying(512)
);

-- CONSTRAINT: following following_pkey
ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_FOLLOWING_FOLLOWEE_HOST
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_HOST" ON "public"."following" USING "btree" ("followeeHost");

-- INDEX: IDX_FOLLOWING_FOLLOWEE_ID
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_ID" ON "public"."following" USING "btree" ("followeeId");

-- INDEX: IDX_FOLLOWING_FOLLOWEE_ID_FOLLOWER_HOST_IS_FOLLOWER_HIBERNATED
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_ID_FOLLOWER_HOST_IS_FOLLOWER_HIBERNATED" ON "public"."following" USING "btree" ("followeeId", "followerHost", "isFollowerHibernated");

-- INDEX: IDX_FOLLOWING_FOLLOWEE_ID_ID
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_ID_ID" ON "public"."following" USING "btree" ("followeeId", "id");

-- INDEX: IDX_FOLLOWING_FOLLOWER_HOST
CREATE INDEX "IDX_FOLLOWING_FOLLOWER_HOST" ON "public"."following" USING "btree" ("followerHost");

-- INDEX: IDX_FOLLOWING_FOLLOWER_ID
CREATE INDEX "IDX_FOLLOWING_FOLLOWER_ID" ON "public"."following" USING "btree" ("followerId");

-- INDEX: IDX_FOLLOWING_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_FOLLOWING_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE" ON "public"."following" USING "btree" ("followerId", "followeeId");

-- INDEX: IDX_FOLLOWING_FOLLOWER_ID_ID
CREATE INDEX "IDX_FOLLOWING_FOLLOWER_ID_ID" ON "public"."following" USING "btree" ("followerId", "id");

-- INDEX: IDX_FOLLOWING_NOTIFY
CREATE INDEX "IDX_FOLLOWING_NOTIFY" ON "public"."following" USING "btree" ("notify");
