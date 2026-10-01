-- TABLE: announcement_read
CREATE TABLE "public"."announcement_read" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "announcementId" character varying(32) NOT NULL
);

-- CONSTRAINT: announcement_read announcement_read_pkey
ALTER TABLE ONLY "public"."announcement_read"
    ADD CONSTRAINT "announcement_read_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ANNOUNCEMENT_READ_ANNOUNCEMENT_ID
CREATE INDEX "IDX_ANNOUNCEMENT_READ_ANNOUNCEMENT_ID" ON "public"."announcement_read" USING "btree" ("announcementId");

-- INDEX: IDX_ANNOUNCEMENT_READ_USER_ID
CREATE INDEX "IDX_ANNOUNCEMENT_READ_USER_ID" ON "public"."announcement_read" USING "btree" ("userId");

-- INDEX: IDX_ANNOUNCEMENT_READ_USER_ID_ANNOUNCEMENT_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_ANNOUNCEMENT_READ_USER_ID_ANNOUNCEMENT_ID_UNIQUE" ON "public"."announcement_read" USING "btree" ("userId", "announcementId");
