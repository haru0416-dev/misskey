-- TABLE: user_memo
CREATE TABLE "public"."user_memo" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "targetUserId" character varying(32) NOT NULL,
    "memo" character varying(2048) NOT NULL
);

-- CONSTRAINT: user_memo user_memo_pkey
ALTER TABLE ONLY "public"."user_memo"
    ADD CONSTRAINT "user_memo_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_MEMO_TARGET_USER_ID
CREATE INDEX "IDX_USER_MEMO_TARGET_USER_ID" ON "public"."user_memo" USING "btree" ("targetUserId");

-- INDEX: IDX_USER_MEMO_USER_ID
CREATE INDEX "IDX_USER_MEMO_USER_ID" ON "public"."user_memo" USING "btree" ("userId");

-- INDEX: IDX_USER_MEMO_USER_ID_TARGET_USER_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_MEMO_USER_ID_TARGET_USER_ID_UNIQUE" ON "public"."user_memo" USING "btree" ("userId", "targetUserId");
