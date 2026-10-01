-- TABLE: chat_room_invitation
CREATE TABLE "public"."chat_room_invitation" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32) NOT NULL,
    "roomId" character varying(32) NOT NULL,
    "ignored" boolean DEFAULT false NOT NULL
);

-- CONSTRAINT: chat_room_invitation chat_room_invitation_pkey
ALTER TABLE ONLY "public"."chat_room_invitation"
    ADD CONSTRAINT "chat_room_invitation_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHAT_ROOM_INVITATION_ROOM_ID
CREATE INDEX "IDX_CHAT_ROOM_INVITATION_ROOM_ID" ON "public"."chat_room_invitation" USING "btree" ("roomId");

-- INDEX: IDX_CHAT_ROOM_INVITATION_USER_ID
CREATE INDEX "IDX_CHAT_ROOM_INVITATION_USER_ID" ON "public"."chat_room_invitation" USING "btree" ("userId");

-- INDEX: IDX_CHAT_ROOM_INVITATION_USER_ID_ROOM_ID_UNIQUE
CREATE UNIQUE INDEX "IDX_CHAT_ROOM_INVITATION_USER_ID_ROOM_ID_UNIQUE" ON "public"."chat_room_invitation" USING "btree" ("userId", "roomId");
