-- TABLE: hashtag_user
CREATE TABLE "public"."hashtag_user" (
    "hashtagId" character varying(32) NOT NULL,
    "attached" boolean NOT NULL,
    "userId" character varying(32) NOT NULL
);

-- CONSTRAINT: hashtag_user PK_HASHTAG_USER
ALTER TABLE ONLY "public"."hashtag_user"
    ADD CONSTRAINT "PK_HASHTAG_USER" PRIMARY KEY ("hashtagId", "attached", "userId");

-- INDEX: IDX_HASHTAG_USER_USER_ID
CREATE INDEX "IDX_HASHTAG_USER_USER_ID" ON "public"."hashtag_user" USING "btree" ("userId");
