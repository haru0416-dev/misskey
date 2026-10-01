-- TABLE: chat_approval
CREATE TABLE "public"."chat_approval" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "otherId" character varying(32) NOT NULL
);

-- CONSTRAINT: chat_approval chat_approval_pkey
ALTER TABLE ONLY "public"."chat_approval"
    ADD CONSTRAINT "chat_approval_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHAT_APPROVAL_OTHER_ID
CREATE INDEX "IDX_CHAT_APPROVAL_OTHER_ID" ON "public"."chat_approval" USING "btree" ("otherId");

-- INDEX: IDX_CHAT_APPROVAL_USER_ID
CREATE INDEX "IDX_CHAT_APPROVAL_USER_ID" ON "public"."chat_approval" USING "btree" ("userId");

-- INDEX: IDX_CHAT_APPROVAL_USER_ID_OTHER_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CHAT_APPROVAL_USER_ID_OTHER_ID_UNIQUE" ON "public"."chat_approval" USING "btree" ("userId", "otherId");
