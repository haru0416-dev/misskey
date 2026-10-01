-- FK CONSTRAINT: note note_channelId_channel_id_fk
ALTER TABLE ONLY "public"."note"
    ADD CONSTRAINT "note_channelId_channel_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."channel"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: note note_userId_user_id_fk
ALTER TABLE ONLY "public"."note"
    ADD CONSTRAINT "note_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
