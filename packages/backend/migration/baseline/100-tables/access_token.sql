-- TABLE: access_token
CREATE TABLE "public"."access_token" (
    "id" character varying(32) NOT NULL,
    "lastUsedAt" timestamp with time zone,
    "token" character varying(128) NOT NULL,
    "session" character varying(128),
    "userId" character varying(32) NOT NULL,
    "name" character varying(128),
    "description" character varying(512),
    "iconUrl" character varying(512),
    "permission" character varying(64)[] DEFAULT '{}'::character varying[] NOT NULL,
    "fetched" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: access_token access_token_pkey
ALTER TABLE ONLY "public"."access_token"
    ADD CONSTRAINT "access_token_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ACCESS_TOKEN_SESSION
CREATE INDEX "IDX_ACCESS_TOKEN_SESSION" ON "public"."access_token" USING "btree" ("session");

-- INDEX: IDX_ACCESS_TOKEN_TOKEN
CREATE INDEX "IDX_ACCESS_TOKEN_TOKEN" ON "public"."access_token" USING "btree" ("token");

-- INDEX: IDX_ACCESS_TOKEN_USER_ID
CREATE INDEX "IDX_ACCESS_TOKEN_USER_ID" ON "public"."access_token" USING "btree" ("userId");
