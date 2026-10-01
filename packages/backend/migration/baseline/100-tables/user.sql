-- TABLE: user
CREATE TABLE "public"."user" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone,
    "lastFetchedAt" timestamp with time zone,
    "lastActiveDate" timestamp with time zone,
    "hideOnlineStatus" boolean DEFAULT false NOT NULL,
    "username" character varying(128) NOT NULL,
    "usernameLower" character varying(128) NOT NULL,
    "name" character varying(128),
    "followersCount" integer DEFAULT 0 NOT NULL,
    "followingCount" integer DEFAULT 0 NOT NULL,
    "movedToUri" character varying(512),
    "movedAt" timestamp with time zone,
    "alsoKnownAs" "text",
    "notesCount" integer DEFAULT 0 NOT NULL,
    "avatarId" character varying(32),
    "bannerId" character varying(32),
    "avatarUrl" character varying(1024),
    "bannerUrl" character varying(512),
    "avatarBlurhash" character varying(128),
    "bannerBlurhash" character varying(128),
    "avatarDecorations" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "tags" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "isSuspended" boolean DEFAULT false NOT NULL,
    "isLocked" boolean DEFAULT false NOT NULL,
    "isBot" boolean DEFAULT false NOT NULL,
    "isCat" boolean DEFAULT false NOT NULL,
    "isExplorable" boolean DEFAULT true NOT NULL,
    "isHibernated" boolean DEFAULT false NOT NULL,
    "requireSigninToViewContents" boolean DEFAULT false NOT NULL,
    "makeNotesFollowersOnlyBefore" integer,
    "makeNotesHiddenBefore" integer,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "emojis" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "chatScope" character varying(128) DEFAULT 'mutual'::character varying NOT NULL,
    "host" character varying(128),
    "inbox" character varying(512),
    "sharedInbox" character varying(512),
    "featured" character varying(512),
    "uri" character varying(512),
    "followersUri" character varying(512),
    "token" character(16),
    "suspensionTransitionId" character varying(32)
);

-- CONSTRAINT: user user_pkey
ALTER TABLE ONLY "public"."user"
    ADD CONSTRAINT "user_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_FOLLOWERS_COUNT
CREATE INDEX "IDX_USER_FOLLOWERS_COUNT" ON "public"."user" USING "btree" ("followersCount");

-- INDEX: IDX_USER_HOST
CREATE INDEX "IDX_USER_HOST" ON "public"."user" USING "btree" ("host");

-- INDEX: IDX_USER_IS_EXPLORABLE
CREATE INDEX "IDX_USER_IS_EXPLORABLE" ON "public"."user" USING "btree" ("isExplorable");

-- INDEX: IDX_USER_LAST_ACTIVE_DATE
CREATE INDEX "IDX_USER_LAST_ACTIVE_DATE" ON "public"."user" USING "btree" ("lastActiveDate");

-- INDEX: IDX_USER_NAME_TRGM
CREATE INDEX "IDX_USER_NAME_TRGM" ON "public"."user" USING "gin" ("name" "gin_trgm_ops");

-- INDEX: IDX_USER_TAGS
CREATE INDEX "IDX_USER_TAGS" ON "public"."user" USING "btree" ("tags");

-- INDEX: IDX_USER_TOKEN_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_TOKEN_UNIQUE" ON "public"."user" USING "btree" ("token");

-- INDEX: IDX_USER_UPDATED_AT
CREATE INDEX "IDX_USER_UPDATED_AT" ON "public"."user" USING "btree" ("updatedAt");

-- INDEX: IDX_USER_UPDATED_AT_DESC_NULLS_LAST
CREATE INDEX "IDX_USER_UPDATED_AT_DESC_NULLS_LAST" ON "public"."user" USING "btree" ("updatedAt" DESC NULLS LAST);

-- INDEX: IDX_USER_URI
CREATE INDEX "IDX_USER_URI" ON "public"."user" USING "btree" ("uri");

-- INDEX: IDX_USER_USERNAME_LOWER
CREATE INDEX "IDX_USER_USERNAME_LOWER" ON "public"."user" USING "btree" ("usernameLower");

-- INDEX: IDX_USER_USERNAME_LOWER_HOST_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_USERNAME_LOWER_HOST_UNIQUE" ON "public"."user" USING "btree" ("usernameLower", "host");

-- INDEX: IDX_USER_USERNAME_LOWER_PATTERN
CREATE INDEX "IDX_USER_USERNAME_LOWER_PATTERN" ON "public"."user" USING "btree" ("usernameLower" "varchar_pattern_ops");

-- INDEX: IDX_USER_USERNAME_LOWER_TRGM
CREATE INDEX "IDX_USER_USERNAME_LOWER_TRGM" ON "public"."user" USING "gin" ("usernameLower" "gin_trgm_ops");

-- INDEX: REL_58f5c71eaab331645112cf8cfa
CREATE UNIQUE INDEX "REL_58f5c71eaab331645112cf8cfa" ON "public"."user" USING "btree" ("avatarId");

-- INDEX: REL_afc64b53f8db3707ceb34eb28e
CREATE UNIQUE INDEX "REL_afc64b53f8db3707ceb34eb28e" ON "public"."user" USING "btree" ("bannerId");
