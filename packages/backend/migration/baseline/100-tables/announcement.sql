-- TABLE: announcement
CREATE TABLE "public"."announcement" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone,
    "text" character varying(8192) NOT NULL,
    "title" character varying(256) NOT NULL,
    "imageUrl" character varying(1024),
    "icon" character varying(256) DEFAULT 'info'::character varying NOT NULL,
    "display" character varying(256) DEFAULT 'normal'::character varying NOT NULL,
    "needConfirmationToRead" boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "forExistingUsers" boolean DEFAULT false NOT NULL,
    "silence" boolean DEFAULT false NOT NULL,
    "userId" character varying(32)
);

-- CONSTRAINT: announcement announcement_pkey
ALTER TABLE ONLY "public"."announcement"
    ADD CONSTRAINT "announcement_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ANNOUNCEMENT_FOR_EXISTING_USERS
CREATE INDEX "IDX_ANNOUNCEMENT_FOR_EXISTING_USERS" ON "public"."announcement" USING "btree" ("forExistingUsers");

-- INDEX: IDX_ANNOUNCEMENT_IS_ACTIVE
CREATE INDEX "IDX_ANNOUNCEMENT_IS_ACTIVE" ON "public"."announcement" USING "btree" ("isActive");

-- INDEX: IDX_ANNOUNCEMENT_SILENCE
CREATE INDEX "IDX_ANNOUNCEMENT_SILENCE" ON "public"."announcement" USING "btree" ("silence");

-- INDEX: IDX_ANNOUNCEMENT_USER_ID
CREATE INDEX "IDX_ANNOUNCEMENT_USER_ID" ON "public"."announcement" USING "btree" ("userId");
