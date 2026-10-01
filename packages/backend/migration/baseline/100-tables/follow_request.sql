-- TABLE: follow_request
CREATE TABLE "public"."follow_request" (
    "id" character varying(32) NOT NULL,
    "followeeId" character varying(32) NOT NULL,
    "followerId" character varying(32) NOT NULL,
    "requestId" character varying(128),
    "withReplies" boolean DEFAULT false NOT NULL,
    "followerHost" character varying(128),
    "followerInbox" character varying(512),
    "followerSharedInbox" character varying(512),
    "followeeHost" character varying(128),
    "followeeInbox" character varying(512),
    "followeeSharedInbox" character varying(512)
);

-- CONSTRAINT: follow_request follow_request_pkey
ALTER TABLE ONLY "public"."follow_request"
    ADD CONSTRAINT "follow_request_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_FOLLOW_REQUEST_FOLLOWEE_ID
CREATE INDEX "IDX_FOLLOW_REQUEST_FOLLOWEE_ID" ON "public"."follow_request" USING "btree" ("followeeId");

-- INDEX: IDX_FOLLOW_REQUEST_FOLLOWER_ID
CREATE INDEX "IDX_FOLLOW_REQUEST_FOLLOWER_ID" ON "public"."follow_request" USING "btree" ("followerId");

-- INDEX: IDX_FOLLOW_REQUEST_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_FOLLOW_REQUEST_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE" ON "public"."follow_request" USING "btree" ("followerId", "followeeId");
