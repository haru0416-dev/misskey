-- FK CONSTRAINT: chat_room chat_room_ownerId_user_id_fk
ALTER TABLE ONLY "public"."chat_room"
    ADD CONSTRAINT "chat_room_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
