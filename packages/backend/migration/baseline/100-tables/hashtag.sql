-- TABLE: hashtag
CREATE TABLE "public"."hashtag" (
    "id" character varying(32) NOT NULL,
    "name" character varying(128) NOT NULL,
    "mentionedUsersCount" integer DEFAULT 0 NOT NULL,
    "mentionedLocalUsersCount" integer DEFAULT 0 NOT NULL,
    "mentionedRemoteUsersCount" integer DEFAULT 0 NOT NULL,
    "attachedUsersCount" integer DEFAULT 0 NOT NULL,
    "attachedLocalUsersCount" integer DEFAULT 0 NOT NULL,
    "attachedRemoteUsersCount" integer DEFAULT 0 NOT NULL
);

-- CONSTRAINT: hashtag hashtag_pkey
ALTER TABLE ONLY "public"."hashtag"
    ADD CONSTRAINT "hashtag_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_HASHTAG_ATTACHED_LOCAL_USERS_COUNT
CREATE INDEX "IDX_HASHTAG_ATTACHED_LOCAL_USERS_COUNT" ON "public"."hashtag" USING "btree" ("attachedLocalUsersCount");

-- INDEX: IDX_HASHTAG_ATTACHED_REMOTE_USERS_COUNT
CREATE INDEX "IDX_HASHTAG_ATTACHED_REMOTE_USERS_COUNT" ON "public"."hashtag" USING "btree" ("attachedRemoteUsersCount");

-- INDEX: IDX_HASHTAG_ATTACHED_USERS_COUNT
CREATE INDEX "IDX_HASHTAG_ATTACHED_USERS_COUNT" ON "public"."hashtag" USING "btree" ("attachedUsersCount");

-- INDEX: IDX_HASHTAG_MENTIONED_LOCAL_USERS_COUNT
CREATE INDEX "IDX_HASHTAG_MENTIONED_LOCAL_USERS_COUNT" ON "public"."hashtag" USING "btree" ("mentionedLocalUsersCount");

-- INDEX: IDX_HASHTAG_MENTIONED_REMOTE_USERS_COUNT
CREATE INDEX "IDX_HASHTAG_MENTIONED_REMOTE_USERS_COUNT" ON "public"."hashtag" USING "btree" ("mentionedRemoteUsersCount");

-- INDEX: IDX_HASHTAG_MENTIONED_USERS_COUNT
CREATE INDEX "IDX_HASHTAG_MENTIONED_USERS_COUNT" ON "public"."hashtag" USING "btree" ("mentionedUsersCount");

-- INDEX: IDX_HASHTAG_NAME_UNIQUE
CREATE UNIQUE INDEX "IDX_HASHTAG_NAME_UNIQUE" ON "public"."hashtag" USING "btree" ("name");
