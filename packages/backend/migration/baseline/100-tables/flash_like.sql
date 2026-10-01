-- TABLE: flash_like
CREATE TABLE "public"."flash_like" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "flashId" character varying(32) NOT NULL
);

-- CONSTRAINT: flash_like flash_like_pkey
ALTER TABLE ONLY "public"."flash_like"
    ADD CONSTRAINT "flash_like_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_FLASH_LIKE_FLASH_ID
CREATE INDEX "IDX_FLASH_LIKE_FLASH_ID" ON "public"."flash_like" USING "btree" ("flashId");

-- INDEX: IDX_FLASH_LIKE_USER_ID
CREATE INDEX "IDX_FLASH_LIKE_USER_ID" ON "public"."flash_like" USING "btree" ("userId");

-- INDEX: IDX_FLASH_LIKE_USER_ID_FLASH_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_FLASH_LIKE_USER_ID_FLASH_ID_UNIQUE" ON "public"."flash_like" USING "btree" ("userId", "flashId");
