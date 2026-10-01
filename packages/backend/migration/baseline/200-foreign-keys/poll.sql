-- FK CONSTRAINT: poll poll_noteId_note_id_fk
ALTER TABLE ONLY "public"."poll"
    ADD CONSTRAINT "poll_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;
