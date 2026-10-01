-- FK CONSTRAINT: chat_message chat_message_fileId_drive_file_id_fk
ALTER TABLE ONLY "public"."chat_message"
    ADD CONSTRAINT "chat_message_fileId_drive_file_id_fk" FOREIGN KEY ("fileId") REFERENCES "public"."drive_file"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: chat_message chat_message_fromUserId_user_id_fk
ALTER TABLE ONLY "public"."chat_message"
    ADD CONSTRAINT "chat_message_fromUserId_user_id_fk" FOREIGN KEY ("fromUserId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: chat_message chat_message_toRoomId_chat_room_id_fk
ALTER TABLE ONLY "public"."chat_message"
    ADD CONSTRAINT "chat_message_toRoomId_chat_room_id_fk" FOREIGN KEY ("toRoomId") REFERENCES "public"."chat_room"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: chat_message chat_message_toUserId_user_id_fk
ALTER TABLE ONLY "public"."chat_message"
    ADD CONSTRAINT "chat_message_toUserId_user_id_fk" FOREIGN KEY ("toUserId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
