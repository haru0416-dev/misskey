-- TABLE: flash
CREATE TABLE "public"."flash" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "title" character varying(256) NOT NULL,
    "summary" character varying(1024) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "script" character varying(65536) NOT NULL,
    "permissions" character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    "likedCount" integer DEFAULT 0 NOT NULL,
    "visibility" character varying(512) DEFAULT 'public'::character varying NOT NULL
);

-- CONSTRAINT: flash flash_pkey
ALTER TABLE ONLY "public"."flash"
    ADD CONSTRAINT "flash_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_FLASH_UPDATED_AT
CREATE INDEX "IDX_FLASH_UPDATED_AT" ON "public"."flash" USING "btree" ("updatedAt");

-- INDEX: IDX_FLASH_USER_ID
CREATE INDEX "IDX_FLASH_USER_ID" ON "public"."flash" USING "btree" ("userId");
