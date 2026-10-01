-- TABLE: page
CREATE TABLE "public"."page" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "title" character varying(256) NOT NULL,
    "name" character varying(256) NOT NULL,
    "summary" character varying(256),
    "alignCenter" boolean NOT NULL,
    "hideTitleWhenPinned" boolean DEFAULT false NOT NULL,
    "font" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "eyeCatchingImageId" character varying(32),
    "content" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "variables" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "script" character varying(16384) DEFAULT ''::character varying NOT NULL,
    "visibility" "public"."page_visibility_enum" NOT NULL,
    "visibleUserIds" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "likedCount" integer DEFAULT 0 NOT NULL
);

-- CONSTRAINT: page page_pkey
ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_PAGE_EYE_CATCHING_IMAGE_ID
CREATE INDEX "IDX_PAGE_EYE_CATCHING_IMAGE_ID" ON "public"."page" USING "btree" ("eyeCatchingImageId");

-- INDEX: IDX_PAGE_NAME
CREATE INDEX "IDX_PAGE_NAME" ON "public"."page" USING "btree" ("name");

-- INDEX: IDX_PAGE_UPDATED_AT
CREATE INDEX "IDX_PAGE_UPDATED_AT" ON "public"."page" USING "btree" ("updatedAt");

-- INDEX: IDX_PAGE_USER_ID
CREATE INDEX "IDX_PAGE_USER_ID" ON "public"."page" USING "btree" ("userId");

-- INDEX: IDX_PAGE_USER_ID_NAME_UNIQUE
CREATE UNIQUE INDEX "IDX_PAGE_USER_ID_NAME_UNIQUE" ON "public"."page" USING "btree" ("userId", "name");

-- INDEX: IDX_PAGE_VISIBLE_USER_IDS
CREATE INDEX "IDX_PAGE_VISIBLE_USER_IDS" ON "public"."page" USING "btree" ("visibleUserIds");
