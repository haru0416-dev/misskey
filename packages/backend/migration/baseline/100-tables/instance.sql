-- TABLE: instance
CREATE TABLE "public"."instance" (
    "id" character varying(32) NOT NULL,
    "firstRetrievedAt" timestamp with time zone NOT NULL,
    "host" character varying(128) NOT NULL,
    "usersCount" integer DEFAULT 0 NOT NULL,
    "notesCount" integer DEFAULT 0 NOT NULL,
    "followingCount" integer DEFAULT 0 NOT NULL,
    "followersCount" integer DEFAULT 0 NOT NULL,
    "latestRequestReceivedAt" timestamp with time zone,
    "isNotResponding" boolean DEFAULT false NOT NULL,
    "notRespondingSince" timestamp with time zone,
    "suspensionState" "public"."instance_suspensionstate_enum" DEFAULT 'none'::"public"."instance_suspensionstate_enum" NOT NULL,
    "softwareName" character varying(64),
    "softwareVersion" character varying(64),
    "openRegistrations" boolean,
    "name" character varying(256),
    "description" character varying(4096),
    "maintainerName" character varying(128),
    "maintainerEmail" character varying(256),
    "iconUrl" character varying(256),
    "faviconUrl" character varying(256),
    "themeColor" character varying(64),
    "infoUpdatedAt" timestamp with time zone,
    "moderationNote" character varying(16384) DEFAULT ''::character varying NOT NULL
);

-- CONSTRAINT: instance instance_pkey
ALTER TABLE ONLY "public"."instance"
    ADD CONSTRAINT "instance_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_INSTANCE_FIRST_RETRIEVED_AT
CREATE INDEX "IDX_INSTANCE_FIRST_RETRIEVED_AT" ON "public"."instance" USING "btree" ("firstRetrievedAt");

-- INDEX: IDX_INSTANCE_HOST_UNIQUE
CREATE UNIQUE INDEX "IDX_INSTANCE_HOST_UNIQUE" ON "public"."instance" USING "btree" ("host");

-- INDEX: IDX_INSTANCE_SUSPENSION_STATE
CREATE INDEX "IDX_INSTANCE_SUSPENSION_STATE" ON "public"."instance" USING "btree" ("suspensionState");
