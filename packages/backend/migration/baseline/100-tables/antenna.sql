-- TABLE: antenna
CREATE TABLE "public"."antenna" (
    "id" character varying(32) NOT NULL,
    "lastUsedAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL,
    "name" character varying(128) NOT NULL,
    "src" "public"."antenna_src_enum" NOT NULL,
    "userListId" character varying(32),
    "users" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "keywords" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "excludeKeywords" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "caseSensitive" boolean DEFAULT false NOT NULL,
    "excludeBots" boolean DEFAULT false NOT NULL,
    "withReplies" boolean DEFAULT false NOT NULL,
    "withFile" boolean NOT NULL,
    "expression" character varying(2048),
    "isActive" boolean DEFAULT true NOT NULL,
    "localOnly" boolean DEFAULT false NOT NULL,
    "excludeNotesInSensitiveChannel" boolean DEFAULT false NOT NULL,
    CONSTRAINT "CHK_ANTENNA_LIST_SRC_REQUIRES_USER_LIST" CHECK ((("src" <> 'list'::"public"."antenna_src_enum") OR ("userListId" IS NOT NULL)))
);

-- CONSTRAINT: antenna antenna_pkey
ALTER TABLE ONLY "public"."antenna"
    ADD CONSTRAINT "antenna_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ANTENNA_IS_ACTIVE
CREATE INDEX "IDX_ANTENNA_IS_ACTIVE" ON "public"."antenna" USING "btree" ("isActive");

-- INDEX: IDX_ANTENNA_LAST_USED_AT
CREATE INDEX "IDX_ANTENNA_LAST_USED_AT" ON "public"."antenna" USING "btree" ("lastUsedAt");

-- INDEX: IDX_ANTENNA_USER_ID
CREATE INDEX "IDX_ANTENNA_USER_ID" ON "public"."antenna" USING "btree" ("userId");

-- INDEX: IDX_ANTENNA_USER_LIST_ID
CREATE INDEX "IDX_ANTENNA_USER_LIST_ID" ON "public"."antenna" USING "btree" ("userListId");
