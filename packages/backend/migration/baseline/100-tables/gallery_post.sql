-- TABLE: gallery_post
CREATE TABLE "public"."gallery_post" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "title" character varying(256) NOT NULL,
    "description" character varying(2048),
    "userId" character varying(32) NOT NULL,
    "fileIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL,
    "likedCount" integer DEFAULT 0 NOT NULL,
    "tags" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL
);

-- CONSTRAINT: gallery_post gallery_post_pkey
ALTER TABLE ONLY "public"."gallery_post"
    ADD CONSTRAINT "gallery_post_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_GALLERY_POST_FILE_IDS
CREATE INDEX "IDX_GALLERY_POST_FILE_IDS" ON "public"."gallery_post" USING "btree" ("fileIds");

-- INDEX: IDX_GALLERY_POST_IS_SENSITIVE
CREATE INDEX "IDX_GALLERY_POST_IS_SENSITIVE" ON "public"."gallery_post" USING "btree" ("isSensitive");

-- INDEX: IDX_GALLERY_POST_LIKED_COUNT
CREATE INDEX "IDX_GALLERY_POST_LIKED_COUNT" ON "public"."gallery_post" USING "btree" ("likedCount");

-- INDEX: IDX_GALLERY_POST_TAGS
CREATE INDEX "IDX_GALLERY_POST_TAGS" ON "public"."gallery_post" USING "btree" ("tags");

-- INDEX: IDX_GALLERY_POST_UPDATED_AT
CREATE INDEX "IDX_GALLERY_POST_UPDATED_AT" ON "public"."gallery_post" USING "btree" ("updatedAt");

-- INDEX: IDX_GALLERY_POST_USER_ID
CREATE INDEX "IDX_GALLERY_POST_USER_ID" ON "public"."gallery_post" USING "btree" ("userId");
