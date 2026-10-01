-- FK CONSTRAINT: chat_room_invitation chat_room_invitation_roomId_chat_room_id_fk
ALTER TABLE ONLY "public"."chat_room_invitation"
    ADD CONSTRAINT "chat_room_invitation_roomId_chat_room_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chat_room"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: chat_room_invitation chat_room_invitation_userId_user_id_fk
ALTER TABLE ONLY "public"."chat_room_invitation"
    ADD CONSTRAINT "chat_room_invitation_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
