-- TABLE: ad
CREATE TABLE "public"."ad" (
    "id" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "startsAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "place" character varying(32) NOT NULL,
    "priority" character varying(32) NOT NULL,
    "ratio" integer DEFAULT 1 NOT NULL,
    "url" character varying(1024) NOT NULL,
    "imageUrl" character varying(1024) NOT NULL,
    "memo" character varying(8192) NOT NULL,
    "dayOfWeek" integer DEFAULT 0 NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: ad ad_pkey
ALTER TABLE ONLY "public"."ad"
    ADD CONSTRAINT "ad_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_AD_EXPIRES_AT
CREATE INDEX "IDX_AD_EXPIRES_AT" ON "public"."ad" USING "btree" ("expiresAt");

-- INDEX: IDX_AD_STARTS_AT
CREATE INDEX "IDX_AD_STARTS_AT" ON "public"."ad" USING "btree" ("startsAt");
