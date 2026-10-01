-- TABLE: chat_room
CREATE TABLE "public"."chat_room" (
    "id" character varying(32) NOT NULL,
    "name" character varying(256) NOT NULL,
    "ownerId" character varying(32) NOT NULL,
    "description" character varying(2048) DEFAULT ''::character varying NOT NULL,
    "isArchived" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: chat_room chat_room_pkey
ALTER TABLE ONLY "public"."chat_room"
    ADD CONSTRAINT "chat_room_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHAT_ROOM_OWNER_ID
CREATE INDEX "IDX_CHAT_ROOM_OWNER_ID" ON "public"."chat_room" USING "btree" ("ownerId");
