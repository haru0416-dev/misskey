-- TABLE: poll_vote
CREATE TABLE "public"."poll_vote" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "noteId" character varying(32) NOT NULL,
    "choice" integer NOT NULL
);

-- CONSTRAINT: poll_vote poll_vote_pkey
ALTER TABLE ONLY "public"."poll_vote"
    ADD CONSTRAINT "poll_vote_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_POLL_VOTE_NOTE_ID
CREATE INDEX "IDX_POLL_VOTE_NOTE_ID" ON "public"."poll_vote" USING "btree" ("noteId");

-- INDEX: IDX_POLL_VOTE_USER_ID
CREATE INDEX "IDX_POLL_VOTE_USER_ID" ON "public"."poll_vote" USING "btree" ("userId");

-- INDEX: IDX_POLL_VOTE_USER_ID_NOTE_ID_CHOICE_UNIQUE
CREATE UNIQUE INDEX "IDX_POLL_VOTE_USER_ID_NOTE_ID_CHOICE_UNIQUE" ON "public"."poll_vote" USING "btree" ("userId", "noteId", "choice");
