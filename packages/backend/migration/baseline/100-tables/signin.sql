-- TABLE: signin
CREATE TABLE "public"."signin" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "ip" character varying(128) NOT NULL,
    "headers" "jsonb" NOT NULL,
    "success" boolean NOT NULL
);

-- CONSTRAINT: signin signin_pkey
ALTER TABLE ONLY "public"."signin"
    ADD CONSTRAINT "signin_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_SIGNIN_USER_ID
CREATE INDEX "IDX_SIGNIN_USER_ID" ON "public"."signin" USING "btree" ("userId");

-- INDEX: IDX_SIGNIN_USER_ID_ID
CREATE INDEX "IDX_SIGNIN_USER_ID_ID" ON "public"."signin" USING "btree" ("userId", "id");
