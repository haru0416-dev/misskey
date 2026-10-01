-- TABLE: registry_item
CREATE TABLE "public"."registry_item" (
    "id" character varying(32) NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL,
    "key" character varying(1024) NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb",
    "scope" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
    "domain" character varying(512)
);

-- CONSTRAINT: registry_item UQ_REGISTRY_ITEM_USER_ID_DOMAIN_SCOPE_KEY
ALTER TABLE ONLY "public"."registry_item"
    ADD CONSTRAINT "UQ_REGISTRY_ITEM_USER_ID_DOMAIN_SCOPE_KEY" UNIQUE NULLS NOT DISTINCT ("userId", "domain", "scope", "key");

-- CONSTRAINT: registry_item registry_item_pkey
ALTER TABLE ONLY "public"."registry_item"
    ADD CONSTRAINT "registry_item_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_REGISTRY_ITEM_DOMAIN
CREATE INDEX "IDX_REGISTRY_ITEM_DOMAIN" ON "public"."registry_item" USING "btree" ("domain");

-- INDEX: IDX_REGISTRY_ITEM_SCOPE
CREATE INDEX "IDX_REGISTRY_ITEM_SCOPE" ON "public"."registry_item" USING "btree" ("scope");

-- INDEX: IDX_REGISTRY_ITEM_USER_ID
CREATE INDEX "IDX_REGISTRY_ITEM_USER_ID" ON "public"."registry_item" USING "btree" ("userId");
