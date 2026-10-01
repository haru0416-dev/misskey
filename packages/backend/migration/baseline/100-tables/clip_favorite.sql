-- TABLE: clip_favorite
CREATE TABLE "public"."clip_favorite" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "clipId" character varying(32) NOT NULL
);

-- CONSTRAINT: clip_favorite clip_favorite_pkey
ALTER TABLE ONLY "public"."clip_favorite"
    ADD CONSTRAINT "clip_favorite_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CLIP_FAVORITE_CLIP_ID
CREATE INDEX "IDX_CLIP_FAVORITE_CLIP_ID" ON "public"."clip_favorite" USING "btree" ("clipId");

-- INDEX: IDX_CLIP_FAVORITE_USER_ID
CREATE INDEX "IDX_CLIP_FAVORITE_USER_ID" ON "public"."clip_favorite" USING "btree" ("userId");

-- INDEX: IDX_CLIP_FAVORITE_USER_ID_CLIP_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CLIP_FAVORITE_USER_ID_CLIP_ID_UNIQUE" ON "public"."clip_favorite" USING "btree" ("userId", "clipId");
