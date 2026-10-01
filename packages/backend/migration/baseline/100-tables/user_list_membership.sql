-- TABLE: user_list_membership
CREATE TABLE "public"."user_list_membership" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userListId" character varying(32) NOT NULL,
    "withReplies" boolean DEFAULT false NOT NULL,
    "userListUserId" character varying(32) NOT NULL
);

-- CONSTRAINT: user_list_membership user_list_membership_pkey
ALTER TABLE ONLY "public"."user_list_membership"
    ADD CONSTRAINT "user_list_membership_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_LIST_MEMBERSHIP_USER_ID
CREATE INDEX "IDX_USER_LIST_MEMBERSHIP_USER_ID" ON "public"."user_list_membership" USING "btree" ("userId");

-- INDEX: IDX_USER_LIST_MEMBERSHIP_USER_ID_USER_LIST_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_LIST_MEMBERSHIP_USER_ID_USER_LIST_ID_UNIQUE" ON "public"."user_list_membership" USING "btree" ("userId", "userListId");

-- INDEX: IDX_USER_LIST_MEMBERSHIP_USER_LIST_ID
CREATE INDEX "IDX_USER_LIST_MEMBERSHIP_USER_LIST_ID" ON "public"."user_list_membership" USING "btree" ("userListId");
