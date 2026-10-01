-- TABLE: note_thread_muting
CREATE TABLE "public"."note_thread_muting" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "threadId" character varying(256) NOT NULL
);

-- CONSTRAINT: note_thread_muting note_thread_muting_pkey
ALTER TABLE ONLY "public"."note_thread_muting"
    ADD CONSTRAINT "note_thread_muting_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_NOTE_THREAD_MUTING_THREAD_ID
CREATE INDEX "IDX_NOTE_THREAD_MUTING_THREAD_ID" ON "public"."note_thread_muting" USING "btree" ("threadId");

-- INDEX: IDX_NOTE_THREAD_MUTING_USER_ID
CREATE INDEX "IDX_NOTE_THREAD_MUTING_USER_ID" ON "public"."note_thread_muting" USING "btree" ("userId");

-- INDEX: IDX_NOTE_THREAD_MUTING_USER_ID_THREAD_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_NOTE_THREAD_MUTING_USER_ID_THREAD_ID_UNIQUE" ON "public"."note_thread_muting" USING "btree" ("userId", "threadId");
