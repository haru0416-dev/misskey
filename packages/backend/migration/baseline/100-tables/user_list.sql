-- TABLE: user_list
CREATE TABLE "public"."user_list" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "isPublic" boolean DEFAULT false NOT NULL,
    "name" character varying(128) NOT NULL
);

-- CONSTRAINT: user_list user_list_pkey
ALTER TABLE ONLY "public"."user_list"
    ADD CONSTRAINT "user_list_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_LIST_IS_PUBLIC
CREATE INDEX "IDX_USER_LIST_IS_PUBLIC" ON "public"."user_list" USING "btree" ("isPublic");

-- INDEX: IDX_USER_LIST_USER_ID
CREATE INDEX "IDX_USER_LIST_USER_ID" ON "public"."user_list" USING "btree" ("userId");
