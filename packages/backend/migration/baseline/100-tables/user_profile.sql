-- TABLE: user_profile
CREATE TABLE "public"."user_profile" (
    "userId" character varying(32) NOT NULL,
    "location" character varying(128),
    "birthday" character(10),
    "description" character varying(2048),
    "followedMessage" character varying(256),
    "fields" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "verifiedLinks" character varying[] DEFAULT '{}'::character varying[] NOT NULL,
    "lang" character varying(32),
    "url" character varying(512),
    "email" character varying(128),
    "emailVerifyCode" character varying(128),
    "emailVerified" boolean DEFAULT false NOT NULL,
    "emailNotificationTypes" "jsonb" DEFAULT '["follow", "receiveFollowRequest"]'::"jsonb" NOT NULL,
    "publicReactions" boolean DEFAULT true NOT NULL,
    "followingVisibility" "public"."user_profile_followingvisibility_enum" DEFAULT 'public'::"public"."user_profile_followingvisibility_enum" NOT NULL,
    "followersVisibility" "public"."user_profile_followersvisibility_enum" DEFAULT 'public'::"public"."user_profile_followersvisibility_enum" NOT NULL,
    "twoFactorTempSecret" character varying(128),
    "twoFactorSecret" character varying(128),
    "twoFactorBackupSecret" character varying[],
    "twoFactorEnabled" boolean DEFAULT false NOT NULL,
    "securityKeysAvailable" boolean DEFAULT false NOT NULL,
    "usePasswordLessLogin" boolean DEFAULT false NOT NULL,
    "password" character varying(128),
    "moderationNote" character varying(8192) DEFAULT ''::character varying NOT NULL,
    "autoAcceptFollowed" boolean DEFAULT false NOT NULL,
    "noCrawle" boolean DEFAULT false NOT NULL,
    "preventAiLearning" boolean DEFAULT true NOT NULL,
    "alwaysMarkNsfw" boolean DEFAULT false NOT NULL,
    "autoSensitive" boolean DEFAULT false NOT NULL,
    "carefulBot" boolean DEFAULT false NOT NULL,
    "injectFeaturedNote" boolean DEFAULT true NOT NULL,
    "receiveAnnouncementEmail" boolean DEFAULT true NOT NULL,
    "pinnedPageId" character varying(32),
    "enableWordMute" boolean DEFAULT false NOT NULL,
    "mutedWords" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "hardMutedWords" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "mutedInstances" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "notificationRecieveConfig" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "loggedInDates" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "achievements" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "userHost" character varying(128)
);

-- CONSTRAINT: user_profile user_profile_pkey
ALTER TABLE ONLY "public"."user_profile"
    ADD CONSTRAINT "user_profile_pkey" PRIMARY KEY ("userId");

-- INDEX: IDX_USERPROFILE_BIRTHDAY_DATE
CREATE INDEX "IDX_USERPROFILE_BIRTHDAY_DATE" ON "public"."user_profile" USING "btree" ("public"."get_birthday_date"(("birthday")::"text"));

-- INDEX: IDX_USER_PROFILE_DESCRIPTION_TRGM
CREATE INDEX "IDX_USER_PROFILE_DESCRIPTION_TRGM" ON "public"."user_profile" USING "gin" ("description" "gin_trgm_ops");

-- INDEX: IDX_USER_PROFILE_ENABLE_WORD_MUTE
CREATE INDEX "IDX_USER_PROFILE_ENABLE_WORD_MUTE" ON "public"."user_profile" USING "btree" ("enableWordMute");

-- INDEX: IDX_USER_PROFILE_USER_HOST
CREATE INDEX "IDX_USER_PROFILE_USER_HOST" ON "public"."user_profile" USING "btree" ("userHost");

-- INDEX: REL_6dc44f1ceb65b1e72bacef2ca2
CREATE UNIQUE INDEX "REL_6dc44f1ceb65b1e72bacef2ca2" ON "public"."user_profile" USING "btree" ("pinnedPageId");
