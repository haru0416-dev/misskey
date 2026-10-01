-- TABLE: role
CREATE TABLE "public"."role" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "lastUsedAt" timestamp with time zone NOT NULL,
    "name" character varying(256) NOT NULL,
    "description" character varying(1024) NOT NULL,
    "color" character varying(256),
    "iconUrl" character varying(512),
    "target" "public"."role_target_enum" DEFAULT 'manual'::"public"."role_target_enum" NOT NULL,
    "condFormula" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "isPublic" boolean DEFAULT false NOT NULL,
    "asBadge" boolean DEFAULT false NOT NULL,
    "isModerator" boolean DEFAULT false NOT NULL,
    "isAdministrator" boolean DEFAULT false NOT NULL,
    "isExplorable" boolean DEFAULT false NOT NULL,
    "preserveAssignmentOnMoveAccount" boolean DEFAULT false NOT NULL,
    "canEditMembersByModerator" boolean DEFAULT false NOT NULL,
    "displayOrder" integer DEFAULT 0 NOT NULL,
    "policies" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);

-- CONSTRAINT: role role_pkey
ALTER TABLE ONLY "public"."role"
    ADD CONSTRAINT "role_pkey" PRIMARY KEY ("id");
