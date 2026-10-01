-- TABLE: user_security_key
CREATE TABLE "public"."user_security_key" (
    "id" character varying NOT NULL,
    "userId" character varying(32) NOT NULL,
    "name" character varying(30) NOT NULL,
    "publicKey" character varying NOT NULL,
    "counter" bigint DEFAULT 0 NOT NULL,
    "lastUsed" timestamp with time zone DEFAULT "now"() NOT NULL,
    "credentialDeviceType" character varying(32),
    "credentialBackedUp" boolean,
    "transports" character varying(32)[]
);

-- CONSTRAINT: user_security_key user_security_key_pkey
ALTER TABLE ONLY "public"."user_security_key"
    ADD CONSTRAINT "user_security_key_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_SECURITY_KEY_PUBLIC_KEY
CREATE INDEX "IDX_USER_SECURITY_KEY_PUBLIC_KEY" ON "public"."user_security_key" USING "btree" ("publicKey");

-- INDEX: IDX_USER_SECURITY_KEY_USER_ID
CREATE INDEX "IDX_USER_SECURITY_KEY_USER_ID" ON "public"."user_security_key" USING "btree" ("userId");
