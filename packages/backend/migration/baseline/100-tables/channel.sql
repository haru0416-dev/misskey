-- TABLE: channel
CREATE TABLE "public"."channel" (
    "id" character varying(32) NOT NULL,
    "lastNotedAt" timestamp with time zone,
    "userId" character varying(32),
    "name" character varying(128) NOT NULL,
    "description" character varying(2048),
    "bannerId" character varying(32),
    "pinnedNoteIds" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "color" character varying(16) DEFAULT '#86b300'::character varying NOT NULL,
    "isArchived" boolean DEFAULT false NOT NULL,
    "notesCount" integer DEFAULT 0 NOT NULL,
    "usersCount" integer DEFAULT 0 NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL,
    "allowRenoteToExternal" boolean DEFAULT true NOT NULL
);

-- CONSTRAINT: channel channel_pkey
ALTER TABLE ONLY "public"."channel"
    ADD CONSTRAINT "channel_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHANNEL_BANNER_ID
CREATE INDEX "IDX_CHANNEL_BANNER_ID" ON "public"."channel" USING "btree" ("bannerId");

-- INDEX: IDX_CHANNEL_IS_ARCHIVED
CREATE INDEX "IDX_CHANNEL_IS_ARCHIVED" ON "public"."channel" USING "btree" ("isArchived");

-- INDEX: IDX_CHANNEL_LAST_NOTED_AT
CREATE INDEX "IDX_CHANNEL_LAST_NOTED_AT" ON "public"."channel" USING "btree" ("lastNotedAt");

-- INDEX: IDX_CHANNEL_NOTES_COUNT
CREATE INDEX "IDX_CHANNEL_NOTES_COUNT" ON "public"."channel" USING "btree" ("notesCount");

-- INDEX: IDX_CHANNEL_USERS_COUNT
CREATE INDEX "IDX_CHANNEL_USERS_COUNT" ON "public"."channel" USING "btree" ("usersCount");

-- INDEX: IDX_CHANNEL_USER_ID
CREATE INDEX "IDX_CHANNEL_USER_ID" ON "public"."channel" USING "btree" ("userId");
