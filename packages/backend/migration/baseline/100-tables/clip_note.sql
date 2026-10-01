-- TABLE: clip_note
CREATE TABLE "public"."clip_note" (
    "id" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    "clipId" character varying(32) NOT NULL
);

-- CONSTRAINT: clip_note clip_note_pkey
ALTER TABLE ONLY "public"."clip_note"
    ADD CONSTRAINT "clip_note_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CLIP_NOTE_CLIP_ID
CREATE INDEX "IDX_CLIP_NOTE_CLIP_ID" ON "public"."clip_note" USING "btree" ("clipId");

-- INDEX: IDX_CLIP_NOTE_NOTE_ID
CREATE INDEX "IDX_CLIP_NOTE_NOTE_ID" ON "public"."clip_note" USING "btree" ("noteId");

-- INDEX: IDX_CLIP_NOTE_NOTE_ID_CLIP_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CLIP_NOTE_NOTE_ID_CLIP_ID_UNIQUE" ON "public"."clip_note" USING "btree" ("noteId", "clipId");
