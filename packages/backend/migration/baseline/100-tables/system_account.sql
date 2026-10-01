-- TABLE: system_account
CREATE TABLE "public"."system_account" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "type" character varying(256) NOT NULL
);

-- CONSTRAINT: system_account system_account_pkey
ALTER TABLE ONLY "public"."system_account"
    ADD CONSTRAINT "system_account_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_SYSTEM_ACCOUNT_TYPE_UNIQUE
CREATE UNIQUE INDEX "IDX_SYSTEM_ACCOUNT_TYPE_UNIQUE" ON "public"."system_account" USING "btree" ("type");

-- INDEX: IDX_SYSTEM_ACCOUNT_USER_ID
CREATE INDEX "IDX_SYSTEM_ACCOUNT_USER_ID" ON "public"."system_account" USING "btree" ("userId");
