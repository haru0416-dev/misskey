-- TABLE: password_reset_request
CREATE TABLE "public"."password_reset_request" (
    "id" character varying(32) NOT NULL,
    "token" character varying(256) NOT NULL,
    "userId" character varying(32) NOT NULL
);

-- CONSTRAINT: password_reset_request password_reset_request_pkey
ALTER TABLE ONLY "public"."password_reset_request"
    ADD CONSTRAINT "password_reset_request_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_PASSWORD_RESET_REQUEST_TOKEN_UNIQUE
CREATE UNIQUE INDEX "IDX_PASSWORD_RESET_REQUEST_TOKEN_UNIQUE" ON "public"."password_reset_request" USING "btree" ("token");

-- INDEX: IDX_PASSWORD_RESET_REQUEST_USER_ID
CREATE INDEX "IDX_PASSWORD_RESET_REQUEST_USER_ID" ON "public"."password_reset_request" USING "btree" ("userId");
