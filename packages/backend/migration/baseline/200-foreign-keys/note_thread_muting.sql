-- FK CONSTRAINT: note_thread_muting note_thread_muting_userId_user_id_fk
ALTER TABLE ONLY "public"."note_thread_muting"
    ADD CONSTRAINT "note_thread_muting_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
