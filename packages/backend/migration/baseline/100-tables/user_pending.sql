-- TABLE: user_pending
CREATE TABLE "public"."user_pending" (
    "id" character varying(32) NOT NULL,
    "code" character varying(128) NOT NULL,
    "username" character varying(128) NOT NULL,
    "email" character varying(128) NOT NULL,
    "password" character varying(128) NOT NULL
);

-- CONSTRAINT: user_pending user_pending_pkey
ALTER TABLE ONLY "public"."user_pending"
    ADD CONSTRAINT "user_pending_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_PENDING_CODE_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_PENDING_CODE_UNIQUE" ON "public"."user_pending" USING "btree" ("code");
