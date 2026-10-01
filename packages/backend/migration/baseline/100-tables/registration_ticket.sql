-- TABLE: registration_ticket
CREATE TABLE "public"."registration_ticket" (
    "id" character varying(32) NOT NULL,
    "code" character varying(64) NOT NULL,
    "expiresAt" timestamp with time zone,
    "createdById" character varying(32),
    "usedById" character varying(32),
    "usedAt" timestamp with time zone,
    "pendingUserId" character varying(32)
);

-- CONSTRAINT: registration_ticket registration_ticket_pkey
ALTER TABLE ONLY "public"."registration_ticket"
    ADD CONSTRAINT "registration_ticket_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_REGISTRATION_TICKET_CODE_UNIQUE
CREATE UNIQUE INDEX "IDX_REGISTRATION_TICKET_CODE_UNIQUE" ON "public"."registration_ticket" USING "btree" ("code");

-- INDEX: IDX_REGISTRATION_TICKET_CREATED_BY_ID
CREATE INDEX "IDX_REGISTRATION_TICKET_CREATED_BY_ID" ON "public"."registration_ticket" USING "btree" ("createdById");

-- INDEX: IDX_REGISTRATION_TICKET_USED_BY_ID
CREATE INDEX "IDX_REGISTRATION_TICKET_USED_BY_ID" ON "public"."registration_ticket" USING "btree" ("usedById");

-- INDEX: REL_b6f93f2f30bdbb9a5ebdc7c718
CREATE UNIQUE INDEX "REL_b6f93f2f30bdbb9a5ebdc7c718" ON "public"."registration_ticket" USING "btree" ("usedById");
