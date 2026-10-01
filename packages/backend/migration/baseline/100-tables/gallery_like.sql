-- TABLE: gallery_like
CREATE TABLE "public"."gallery_like" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "postId" character varying(32) NOT NULL
);

-- CONSTRAINT: gallery_like gallery_like_pkey
ALTER TABLE ONLY "public"."gallery_like"
    ADD CONSTRAINT "gallery_like_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_GALLERY_LIKE_POST_ID
CREATE INDEX "IDX_GALLERY_LIKE_POST_ID" ON "public"."gallery_like" USING "btree" ("postId");

-- INDEX: IDX_GALLERY_LIKE_USER_ID
CREATE INDEX "IDX_GALLERY_LIKE_USER_ID" ON "public"."gallery_like" USING "btree" ("userId");

-- INDEX: IDX_GALLERY_LIKE_USER_ID_POST_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_GALLERY_LIKE_USER_ID_POST_ID_UNIQUE" ON "public"."gallery_like" USING "btree" ("userId", "postId");
