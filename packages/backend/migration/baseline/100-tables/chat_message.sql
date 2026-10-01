-- TABLE: chat_message
CREATE TABLE "public"."chat_message" (
    "id" character varying(32) NOT NULL,
    "fromUserId" character varying(32) NOT NULL,
    "toUserId" character varying(32),
    "toRoomId" character varying(32),
    "text" character varying(4096),
    "uri" character varying(512),
    "reads" character varying(32)[] DEFAULT '{}'::character varying[] NOT NULL,
    "fileId" character varying(32),
    "reactions" character varying(1024)[] DEFAULT '{}'::character varying[] NOT NULL
);

-- CONSTRAINT: chat_message chat_message_pkey
ALTER TABLE ONLY "public"."chat_message"
    ADD CONSTRAINT "chat_message_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_CHAT_MESSAGE_FILE_ID
CREATE INDEX "IDX_CHAT_MESSAGE_FILE_ID" ON "public"."chat_message" USING "btree" ("fileId");

-- INDEX: IDX_CHAT_MESSAGE_FROM_USER_ID
CREATE INDEX "IDX_CHAT_MESSAGE_FROM_USER_ID" ON "public"."chat_message" USING "btree" ("fromUserId");

-- INDEX: IDX_CHAT_MESSAGE_TO_ROOM_ID
CREATE INDEX "IDX_CHAT_MESSAGE_TO_ROOM_ID" ON "public"."chat_message" USING "btree" ("toRoomId");

-- INDEX: IDX_CHAT_MESSAGE_TO_USER_ID
CREATE INDEX "IDX_CHAT_MESSAGE_TO_USER_ID" ON "public"."chat_message" USING "btree" ("toUserId");
