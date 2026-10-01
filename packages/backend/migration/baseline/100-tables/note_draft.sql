-- TABLE: note_draft
CREATE TABLE "public"."note_draft" (
    "id" character varying(32) NOT NULL,
    "replyId" character varying(32),
    "renoteId" character varying(32),
    "text" "text",
    "cw" character varying(512),
    "userId" character varying(32) NOT NULL,
    "localOnly" boolean DEFAULT false NOT NULL,
    "reactionAcceptance" character varying(64),
    "visibility" "public"."note_draft_visibility_enum" NOT NULL,
    "fileIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "visibleUserIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "hashtag" character varying(128),
    "channelId" character varying(32),
    "hasPoll" boolean DEFAULT false NOT NULL,
    "pollChoices" character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    "pollMultiple" boolean NOT NULL,
    "pollExpiresAt" timestamp with time zone,
    "pollExpiredAfter" bigint,
    "scheduledAt" timestamp with time zone,
    "isActuallyScheduled" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: note_draft note_draft_pkey
ALTER TABLE ONLY "public"."note_draft"
    ADD CONSTRAINT "note_draft_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_NOTE_DRAFT_CHANNEL_ID
CREATE INDEX "IDX_NOTE_DRAFT_CHANNEL_ID" ON "public"."note_draft" USING "btree" ("channelId");

-- INDEX: IDX_NOTE_DRAFT_FILE_IDS
CREATE INDEX "IDX_NOTE_DRAFT_FILE_IDS" ON "public"."note_draft" USING "gin" ("fileIds");

-- INDEX: IDX_NOTE_DRAFT_RENOTE_ID
CREATE INDEX "IDX_NOTE_DRAFT_RENOTE_ID" ON "public"."note_draft" USING "btree" ("renoteId");

-- INDEX: IDX_NOTE_DRAFT_REPLY_ID
CREATE INDEX "IDX_NOTE_DRAFT_REPLY_ID" ON "public"."note_draft" USING "btree" ("replyId");

-- INDEX: IDX_NOTE_DRAFT_USER_ID
CREATE INDEX "IDX_NOTE_DRAFT_USER_ID" ON "public"."note_draft" USING "btree" ("userId");

-- INDEX: IDX_NOTE_DRAFT_VISIBLE_USER_IDS
CREATE INDEX "IDX_NOTE_DRAFT_VISIBLE_USER_IDS" ON "public"."note_draft" USING "gin" ("visibleUserIds");
