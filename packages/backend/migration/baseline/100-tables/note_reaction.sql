-- TABLE: note_reaction
CREATE TABLE "public"."note_reaction" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    "reaction" character varying(260) NOT NULL
);

-- CONSTRAINT: note_reaction note_reaction_pkey
ALTER TABLE ONLY "public"."note_reaction"
    ADD CONSTRAINT "note_reaction_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_NOTE_REACTION_NOTE_ID
CREATE INDEX "IDX_NOTE_REACTION_NOTE_ID" ON "public"."note_reaction" USING "btree" ("noteId");

-- INDEX: IDX_NOTE_REACTION_NOTE_ID_ID
CREATE INDEX "IDX_NOTE_REACTION_NOTE_ID_ID" ON "public"."note_reaction" USING "btree" ("noteId", "id");

-- INDEX: IDX_NOTE_REACTION_USER_ID
CREATE INDEX "IDX_NOTE_REACTION_USER_ID" ON "public"."note_reaction" USING "btree" ("userId");

-- INDEX: IDX_NOTE_REACTION_USER_ID_ID
CREATE INDEX "IDX_NOTE_REACTION_USER_ID_ID" ON "public"."note_reaction" USING "btree" ("userId", "id");

-- INDEX: IDX_NOTE_REACTION_USER_ID_NOTE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_NOTE_REACTION_USER_ID_NOTE_ID_UNIQUE" ON "public"."note_reaction" USING "btree" ("userId", "noteId");
