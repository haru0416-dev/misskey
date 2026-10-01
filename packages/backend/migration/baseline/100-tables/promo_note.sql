-- TABLE: promo_note
CREATE TABLE "public"."promo_note" (
    "noteId" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL
);

-- CONSTRAINT: promo_note promo_note_pkey
ALTER TABLE ONLY "public"."promo_note"
    ADD CONSTRAINT "promo_note_pkey" PRIMARY KEY ("noteId");

-- INDEX: IDX_PROMO_NOTE_USER_ID
CREATE INDEX "IDX_PROMO_NOTE_USER_ID" ON "public"."promo_note" USING "btree" ("userId");
