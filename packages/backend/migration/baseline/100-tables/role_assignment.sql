-- TABLE: role_assignment
CREATE TABLE "public"."role_assignment" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "roleId" character varying(32) NOT NULL,
    "expiresAt" timestamp with time zone
);

-- CONSTRAINT: role_assignment role_assignment_pkey
ALTER TABLE ONLY "public"."role_assignment"
    ADD CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ROLE_ASSIGNMENT_EXPIRES_AT
CREATE INDEX "IDX_ROLE_ASSIGNMENT_EXPIRES_AT" ON "public"."role_assignment" USING "btree" ("expiresAt");

-- INDEX: IDX_ROLE_ASSIGNMENT_ROLE_ID
CREATE INDEX "IDX_ROLE_ASSIGNMENT_ROLE_ID" ON "public"."role_assignment" USING "btree" ("roleId");

-- INDEX: IDX_ROLE_ASSIGNMENT_USER_ID
CREATE INDEX "IDX_ROLE_ASSIGNMENT_USER_ID" ON "public"."role_assignment" USING "btree" ("userId");

-- INDEX: IDX_ROLE_ASSIGNMENT_USER_ID_ROLE_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_ROLE_ASSIGNMENT_USER_ID_ROLE_ID_UNIQUE" ON "public"."role_assignment" USING "btree" ("userId", "roleId");
