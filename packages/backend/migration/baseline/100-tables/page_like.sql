-- TABLE: page_like
CREATE TABLE "public"."page_like" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "pageId" character varying(32) NOT NULL
);

-- CONSTRAINT: page_like page_like_pkey
ALTER TABLE ONLY "public"."page_like"
    ADD CONSTRAINT "page_like_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_PAGE_LIKE_PAGE_ID
CREATE INDEX "IDX_PAGE_LIKE_PAGE_ID" ON "public"."page_like" USING "btree" ("pageId");

-- INDEX: IDX_PAGE_LIKE_USER_ID
CREATE INDEX "IDX_PAGE_LIKE_USER_ID" ON "public"."page_like" USING "btree" ("userId");

-- INDEX: IDX_PAGE_LIKE_USER_ID_PAGE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_PAGE_LIKE_USER_ID_PAGE_ID_UNIQUE" ON "public"."page_like" USING "btree" ("userId", "pageId");
