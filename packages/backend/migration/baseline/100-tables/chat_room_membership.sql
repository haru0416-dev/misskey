-- TABLE: chat_room_membership
CREATE TABLE "public"."chat_room_membership" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "roomId" character varying(32) NOT NULL,
    "isMuted" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: chat_room_membership chat_room_membership_pkey
ALTER TABLE ONLY "public"."chat_room_membership"
    ADD CONSTRAINT "chat_room_membership_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHAT_ROOM_MEMBERSHIP_ROOM_ID
CREATE INDEX "IDX_CHAT_ROOM_MEMBERSHIP_ROOM_ID" ON "public"."chat_room_membership" USING "btree" ("roomId");

-- INDEX: IDX_CHAT_ROOM_MEMBERSHIP_USER_ID
CREATE INDEX "IDX_CHAT_ROOM_MEMBERSHIP_USER_ID" ON "public"."chat_room_membership" USING "btree" ("userId");

-- INDEX: IDX_CHAT_ROOM_MEMBERSHIP_USER_ID_ROOM_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CHAT_ROOM_MEMBERSHIP_USER_ID_ROOM_ID_UNIQUE" ON "public"."chat_room_membership" USING "btree" ("userId", "roomId");
