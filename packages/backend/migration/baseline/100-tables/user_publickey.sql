-- TABLE: user_publickey
CREATE TABLE "public"."user_publickey" (
    "userId" character varying(32) NOT NULL,
    "keyId" character varying(256) NOT NULL,
    "keyPem" character varying(4096) NOT NULL
);

-- CONSTRAINT: user_publickey user_publickey_pkey
ALTER TABLE ONLY "public"."user_publickey"
    ADD CONSTRAINT "user_publickey_pkey" PRIMARY KEY ("userId");

-- INDEX: IDX_USER_PUBLICKEY_KEY_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_PUBLICKEY_KEY_ID_UNIQUE" ON "public"."user_publickey" USING "btree" ("keyId");
