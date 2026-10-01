-- TABLE: poll
CREATE TABLE "public"."poll" (
    "noteId" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone,
    "multiple" boolean NOT NULL,
    "choices" character varying(256)[] DEFAULT '{}'::character varying[] NOT NULL,
    "votes" integer[] NOT NULL,
    "noteVisibility" "public"."poll_notevisibility_enum" NOT NULL,
    "userId" character varying(32) NOT NULL,
    "userHost" character varying(128),
    "channelId" character varying(32)
);

-- CONSTRAINT: poll poll_pkey
ALTER TABLE ONLY "public"."poll"
    ADD CONSTRAINT "poll_pkey" PRIMARY KEY ("noteId");

-- INDEX: IDX_POLL_CHANNEL_ID
CREATE INDEX "IDX_POLL_CHANNEL_ID" ON "public"."poll" USING "btree" ("channelId");

-- INDEX: IDX_POLL_USER_HOST
CREATE INDEX "IDX_POLL_USER_HOST" ON "public"."poll" USING "btree" ("userHost");

-- INDEX: IDX_POLL_USER_ID
CREATE INDEX "IDX_POLL_USER_ID" ON "public"."poll" USING "btree" ("userId");
