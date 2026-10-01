-- TABLE: used_username
CREATE TABLE "public"."used_username" (
    "username" character varying(128) NOT NULL,
    "createdAt" timestamp with time zone NOT NULL
);

-- CONSTRAINT: used_username used_username_pkey
ALTER TABLE ONLY "public"."used_username"
    ADD CONSTRAINT "used_username_pkey" PRIMARY KEY ("username");
