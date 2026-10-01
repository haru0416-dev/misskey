-- TABLE: avatar_decoration
CREATE TABLE "public"."avatar_decoration" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone,
    "url" character varying(1024) NOT NULL,
    "name" character varying(256) NOT NULL,
    "description" character varying(2048) NOT NULL,
    "roleIdsThatCanBeUsedThisDecoration" character varying(128)[] DEFAULT '{}'::character varying[] NOT NULL,
    "category" character varying(128)
);

-- CONSTRAINT: avatar_decoration avatar_decoration_pkey
ALTER TABLE ONLY "public"."avatar_decoration"
    ADD CONSTRAINT "avatar_decoration_pkey" PRIMARY KEY ("id");
