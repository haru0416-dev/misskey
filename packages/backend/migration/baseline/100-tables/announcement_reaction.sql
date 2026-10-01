-- TABLE: announcement_reaction
CREATE TABLE "public"."announcement_reaction" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "announcementId" character varying(32) NOT NULL,
    "reaction" character varying(260) NOT NULL
);

-- CONSTRAINT: announcement_reaction announcement_reaction_pkey
ALTER TABLE ONLY "public"."announcement_reaction"
    ADD CONSTRAINT "announcement_reaction_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ANNOUNCEMENT_REACTION_ANNOUNCEMENT_ID
CREATE INDEX "IDX_ANNOUNCEMENT_REACTION_ANNOUNCEMENT_ID" ON "public"."announcement_reaction" USING "btree" ("announcementId");

-- INDEX: IDX_ANNOUNCEMENT_REACTION_USER_ID_ANNOUNCEMENT_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_ANNOUNCEMENT_REACTION_USER_ID_ANNOUNCEMENT_ID_UNIQUE" ON "public"."announcement_reaction" USING "btree" ("userId", "announcementId");
