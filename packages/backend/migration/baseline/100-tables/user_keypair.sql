-- TABLE: user_keypair
CREATE TABLE "public"."user_keypair" (
    "userId" character varying(32) NOT NULL,
    "publicKey" character varying(4096) NOT NULL,
    "privateKey" character varying(4096) NOT NULL
);

-- CONSTRAINT: user_keypair user_keypair_pkey
ALTER TABLE ONLY "public"."user_keypair"
    ADD CONSTRAINT "user_keypair_pkey" PRIMARY KEY ("userId");
