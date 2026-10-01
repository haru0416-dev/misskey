-- TABLE: renote_muting
CREATE TABLE "public"."renote_muting" (
    "id" character varying(32) NOT NULL,
    "muteeId" character varying(32) NOT NULL,
    "muterId" character varying(32) NOT NULL
);

-- CONSTRAINT: renote_muting renote_muting_pkey
ALTER TABLE ONLY "public"."renote_muting"
    ADD CONSTRAINT "renote_muting_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_RENOTE_MUTING_MUTEE_ID
CREATE INDEX "IDX_RENOTE_MUTING_MUTEE_ID" ON "public"."renote_muting" USING "btree" ("muteeId");

-- INDEX: IDX_RENOTE_MUTING_MUTER_ID
CREATE INDEX "IDX_RENOTE_MUTING_MUTER_ID" ON "public"."renote_muting" USING "btree" ("muterId");

-- INDEX: IDX_RENOTE_MUTING_MUTER_ID_MUTEE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_RENOTE_MUTING_MUTER_ID_MUTEE_ID_UNIQUE" ON "public"."renote_muting" USING "btree" ("muterId", "muteeId");
