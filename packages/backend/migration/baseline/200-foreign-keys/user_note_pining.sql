-- FK CONSTRAINT: user_note_pining user_note_pining_noteId_note_id_fk
ALTER TABLE ONLY "public"."user_note_pining"
    ADD CONSTRAINT "user_note_pining_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: user_note_pining user_note_pining_userId_user_id_fk
ALTER TABLE ONLY "public"."user_note_pining"
    ADD CONSTRAINT "user_note_pining_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
