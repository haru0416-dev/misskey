-- TABLE: blocking
CREATE TABLE "public"."blocking" (
    "id" character varying(32) NOT NULL,
    "blockeeId" character varying(32) NOT NULL,
    "blockerId" character varying(32) NOT NULL
);

-- CONSTRAINT: blocking blocking_pkey
ALTER TABLE ONLY "public"."blocking"
    ADD CONSTRAINT "blocking_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_BLOCKING_BLOCKEE_ID
CREATE INDEX "IDX_BLOCKING_BLOCKEE_ID" ON "public"."blocking" USING "btree" ("blockeeId");

-- INDEX: IDX_BLOCKING_BLOCKER_ID
CREATE INDEX "IDX_BLOCKING_BLOCKER_ID" ON "public"."blocking" USING "btree" ("blockerId");

-- INDEX: IDX_BLOCKING_BLOCKER_ID_BLOCKEE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_BLOCKING_BLOCKER_ID_BLOCKEE_ID_UNIQUE" ON "public"."blocking" USING "btree" ("blockerId", "blockeeId");
