-- TABLE: user_note_pining
CREATE TABLE "public"."user_note_pining" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL
);

-- CONSTRAINT: user_note_pining user_note_pining_pkey
ALTER TABLE ONLY "public"."user_note_pining"
    ADD CONSTRAINT "user_note_pining_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_NOTE_PINING_NOTE_ID
CREATE INDEX "IDX_USER_NOTE_PINING_NOTE_ID" ON "public"."user_note_pining" USING "btree" ("noteId");

-- INDEX: IDX_USER_NOTE_PINING_USER_ID
CREATE INDEX "IDX_USER_NOTE_PINING_USER_ID" ON "public"."user_note_pining" USING "btree" ("userId");

-- INDEX: IDX_USER_NOTE_PINING_USER_ID_NOTE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_NOTE_PINING_USER_ID_NOTE_ID_UNIQUE" ON "public"."user_note_pining" USING "btree" ("userId", "noteId");
