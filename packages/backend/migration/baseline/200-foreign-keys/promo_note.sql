-- FK CONSTRAINT: promo_note promo_note_noteId_note_id_fk
ALTER TABLE ONLY "public"."promo_note"
    ADD CONSTRAINT "promo_note_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;
