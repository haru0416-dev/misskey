-- TABLE: note_favorite
CREATE TABLE "public"."note_favorite" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL
);

-- CONSTRAINT: note_favorite note_favorite_pkey
ALTER TABLE ONLY "public"."note_favorite"
    ADD CONSTRAINT "note_favorite_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_NOTE_FAVORITE_NOTE_ID
CREATE INDEX "IDX_NOTE_FAVORITE_NOTE_ID" ON "public"."note_favorite" USING "btree" ("noteId");

-- INDEX: IDX_NOTE_FAVORITE_USER_ID
CREATE INDEX "IDX_NOTE_FAVORITE_USER_ID" ON "public"."note_favorite" USING "btree" ("userId");

-- INDEX: IDX_NOTE_FAVORITE_USER_ID_NOTE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_NOTE_FAVORITE_USER_ID_NOTE_ID_UNIQUE" ON "public"."note_favorite" USING "btree" ("userId", "noteId");
