-- TABLE: promo_read
CREATE TABLE "public"."promo_read" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL
);

-- CONSTRAINT: promo_read promo_read_pkey
ALTER TABLE ONLY "public"."promo_read"
    ADD CONSTRAINT "promo_read_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_PROMO_READ_NOTE_ID
CREATE INDEX "IDX_PROMO_READ_NOTE_ID" ON "public"."promo_read" USING "btree" ("noteId");

-- INDEX: IDX_PROMO_READ_USER_ID
CREATE INDEX "IDX_PROMO_READ_USER_ID" ON "public"."promo_read" USING "btree" ("userId");

-- INDEX: IDX_PROMO_READ_USER_ID_NOTE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_PROMO_READ_USER_ID_NOTE_ID_UNIQUE" ON "public"."promo_read" USING "btree" ("userId", "noteId");
