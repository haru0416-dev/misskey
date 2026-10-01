-- TABLE: emoji
CREATE TABLE "public"."emoji" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone,
    "name" character varying(128) NOT NULL,
    "host" character varying(128),
    "category" character varying(128),
    "originalUrl" character varying(512) NOT NULL,
    "publicUrl" character varying(512) DEFAULT ''::character varying NOT NULL,
    "uri" character varying(512),
    "type" character varying(64),
    "aliases" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "license" character varying(1024),
    "localOnly" boolean DEFAULT false NOT NULL,
    "isSensitive" boolean DEFAULT false NOT NULL,
    "roleIdsThatCanBeUsedThisEmojiAsReaction" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL
);

-- CONSTRAINT: emoji emoji_pkey
ALTER TABLE ONLY "public"."emoji"
    ADD CONSTRAINT "emoji_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_EMOJI_CATEGORY
CREATE INDEX "IDX_EMOJI_CATEGORY" ON "public"."emoji" USING "btree" ("category");

-- INDEX: IDX_EMOJI_HOST
CREATE INDEX "IDX_EMOJI_HOST" ON "public"."emoji" USING "btree" ("host");

-- INDEX: IDX_EMOJI_NAME
CREATE INDEX "IDX_EMOJI_NAME" ON "public"."emoji" USING "btree" ("name");

-- INDEX: IDX_EMOJI_NAME_HOST_UNIQUE
CREATE UNIQUE INDEX "IDX_EMOJI_NAME_HOST_UNIQUE" ON "public"."emoji" USING "btree" ("name", "host");

-- INDEX: IDX_EMOJI_ROLE_IDS
CREATE INDEX "IDX_EMOJI_ROLE_IDS" ON "public"."emoji" USING "gin" ("roleIdsThatCanBeUsedThisEmojiAsReaction");
