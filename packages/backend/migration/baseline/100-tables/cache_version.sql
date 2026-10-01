-- TABLE: cache_version
CREATE TABLE "public"."cache_version" (
    "key" character varying(64) NOT NULL,
    "version" integer DEFAULT 0 NOT NULL
);

-- CONSTRAINT: cache_version cache_version_pkey
ALTER TABLE ONLY "public"."cache_version"
    ADD CONSTRAINT "cache_version_pkey" PRIMARY KEY ("key");
