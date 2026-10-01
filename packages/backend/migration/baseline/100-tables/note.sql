-- TABLE: note
CREATE TABLE "public"."note" (
    "id" character varying(32) NOT NULL,
    "replyId" character varying(32),
    "renoteId" character varying(32),
    "threadId" character varying(256),
    "text" "text",
    "name" character varying(256),
    "cw" character varying(512),
    "userId" character varying(32) NOT NULL,
    "localOnly" boolean DEFAULT false NOT NULL,
    "reactionAcceptance" character varying(64),
    "renoteCount" smallint DEFAULT 0 NOT NULL,
    "repliesCount" smallint DEFAULT 0 NOT NULL,
    "clippedCount" smallint DEFAULT 0 NOT NULL,
    "pageCount" smallint DEFAULT 0 NOT NULL,
    "reactions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "visibility" "public"."note_visibility_enum" NOT NULL,
    "uri" character varying(512),
    "url" character varying(512),
    "fileIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "attachedFileTypes" character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    "visibleUserIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "mentions" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "mentionedRemoteUsers" "text" DEFAULT '[]'::"text" NOT NULL,
    "reactionAndUserPairCache" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "emojis" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "tags" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "hasPoll" boolean DEFAULT false NOT NULL,
    "channelId" character varying(32),
    "userHost" character varying(128),
    "replyUserId" character varying(32),
    "replyUserHost" character varying(128),
    "renoteUserId" character varying(32),
    "renoteUserHost" character varying(128),
    "renoteChannelId" character varying(32),
    "updatedAt" timestamp with time zone
);

-- CONSTRAINT: note note_pkey
ALTER TABLE ONLY "public"."note"
    ADD CONSTRAINT "note_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_NOTE_CHANNEL_ID
CREATE INDEX "IDX_NOTE_CHANNEL_ID" ON "public"."note" USING "btree" ("channelId");

-- INDEX: IDX_NOTE_FILE_IDS
CREATE INDEX "IDX_NOTE_FILE_IDS" ON "public"."note" USING "gin" ("fileIds") WITH ("fastupdate"='false');

-- INDEX: IDX_NOTE_MENTIONS
CREATE INDEX "IDX_NOTE_MENTIONS" ON "public"."note" USING "gin" ("mentions") WITH ("fastupdate"='false');

-- INDEX: IDX_NOTE_RENOTE_ID
CREATE INDEX "IDX_NOTE_RENOTE_ID" ON "public"."note" USING "btree" ("renoteId");

-- INDEX: IDX_NOTE_REPLY_ID
CREATE INDEX "IDX_NOTE_REPLY_ID" ON "public"."note" USING "btree" ("replyId");

-- INDEX: IDX_NOTE_TAGS
CREATE INDEX "IDX_NOTE_TAGS" ON "public"."note" USING "gin" ("tags") WITH ("fastupdate"='false');

-- INDEX: IDX_NOTE_TEXT_TRGM
CREATE INDEX "IDX_NOTE_TEXT_TRGM" ON "public"."note" USING "gin" ("lower"("text") "public"."gin_trgm_ops") WITH ("fastupdate"='off');

-- INDEX: IDX_NOTE_THREAD_ID
CREATE INDEX "IDX_NOTE_THREAD_ID" ON "public"."note" USING "btree" ("threadId");

-- INDEX: IDX_NOTE_URI_UNIQUE
CREATE UNIQUE INDEX "IDX_NOTE_URI_UNIQUE" ON "public"."note" USING "btree" ("uri");

-- INDEX: IDX_NOTE_USER_HOST
CREATE INDEX "IDX_NOTE_USER_HOST" ON "public"."note" USING "btree" ("userHost");

-- INDEX: IDX_NOTE_USER_ID_ID
CREATE INDEX "IDX_NOTE_USER_ID_ID" ON "public"."note" USING "btree" ("userId", "id");

-- INDEX: IDX_NOTE_VISIBLE_USER_IDS
CREATE INDEX "IDX_NOTE_VISIBLE_USER_IDS" ON "public"."note" USING "gin" ("visibleUserIds") WITH ("fastupdate"='false');
