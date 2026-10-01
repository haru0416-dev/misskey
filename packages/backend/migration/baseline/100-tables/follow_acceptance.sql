-- TABLE: follow_acceptance
CREATE TABLE "public"."follow_acceptance" (
    "id" character varying(64) NOT NULL,
    "actorUri" "text" NOT NULL,
    "followeeId" character varying(32) NOT NULL,
    "requestId" "text",
    "followingId" character varying(32) NOT NULL
);

-- CONSTRAINT: follow_acceptance follow_acceptance_pkey
ALTER TABLE ONLY "public"."follow_acceptance"
    ADD CONSTRAINT "follow_acceptance_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_FOLLOW_ACCEPTANCE_FOLLOWEE_ID
CREATE INDEX "IDX_FOLLOW_ACCEPTANCE_FOLLOWEE_ID" ON "public"."follow_acceptance" USING "btree" ("followeeId");
