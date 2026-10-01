-- TABLE: user_list_favorite
CREATE TABLE "public"."user_list_favorite" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userListId" character varying(32) NOT NULL
);

-- CONSTRAINT: user_list_favorite user_list_favorite_pkey
ALTER TABLE ONLY "public"."user_list_favorite"
    ADD CONSTRAINT "user_list_favorite_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_LIST_FAVORITE_USER_ID
CREATE INDEX "IDX_USER_LIST_FAVORITE_USER_ID" ON "public"."user_list_favorite" USING "btree" ("userId");

-- INDEX: IDX_USER_LIST_FAVORITE_USER_ID_USER_LIST_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_LIST_FAVORITE_USER_ID_USER_LIST_ID_UNIQUE" ON "public"."user_list_favorite" USING "btree" ("userId", "userListId");

-- INDEX: IDX_USER_LIST_FAVORITE_USER_LIST_ID
CREATE INDEX "IDX_USER_LIST_FAVORITE_USER_LIST_ID" ON "public"."user_list_favorite" USING "btree" ("userListId");
