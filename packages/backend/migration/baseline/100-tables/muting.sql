-- TABLE: muting
CREATE TABLE "public"."muting" (
    "id" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone,
    "muteeId" character varying(32) NOT NULL,
    "muterId" character varying(32) NOT NULL
);

-- CONSTRAINT: muting muting_pkey
ALTER TABLE ONLY "public"."muting"
    ADD CONSTRAINT "muting_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_MUTING_EXPIRES_AT
CREATE INDEX "IDX_MUTING_EXPIRES_AT" ON "public"."muting" USING "btree" ("expiresAt");

-- INDEX: IDX_MUTING_MUTEE_ID
CREATE INDEX "IDX_MUTING_MUTEE_ID" ON "public"."muting" USING "btree" ("muteeId");

-- INDEX: IDX_MUTING_MUTER_ID
CREATE INDEX "IDX_MUTING_MUTER_ID" ON "public"."muting" USING "btree" ("muterId");

-- INDEX: IDX_MUTING_MUTER_ID_MUTEE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_MUTING_MUTER_ID_MUTEE_ID_UNIQUE" ON "public"."muting" USING "btree" ("muterId", "muteeId");
