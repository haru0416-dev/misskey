-- TABLE: clip
CREATE TABLE "public"."clip" (
    "id" character varying(32) NOT NULL,
    "lastClippedAt" timestamp with time zone,
    "userId" character varying(32) NOT NULL,
    "name" character varying(128) NOT NULL,
    "isPublic" boolean DEFAULT false NOT NULL,
    "description" character varying(2048)
);

-- CONSTRAINT: clip clip_pkey
ALTER TABLE ONLY "public"."clip"
    ADD CONSTRAINT "clip_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CLIP_LAST_CLIPPED_AT
CREATE INDEX "IDX_CLIP_LAST_CLIPPED_AT" ON "public"."clip" USING "btree" ("lastClippedAt");

-- INDEX: IDX_CLIP_USER_ID
CREATE INDEX "IDX_CLIP_USER_ID" ON "public"."clip" USING "btree" ("userId");
