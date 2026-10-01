-- FK CONSTRAINT: note_favorite note_favorite_noteId_note_id_fk
ALTER TABLE ONLY "public"."note_favorite"
    ADD CONSTRAINT "note_favorite_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: note_favorite note_favorite_userId_user_id_fk
ALTER TABLE ONLY "public"."note_favorite"
    ADD CONSTRAINT "note_favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
