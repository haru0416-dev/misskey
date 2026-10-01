-- FK CONSTRAINT: promo_read promo_read_noteId_note_id_fk
ALTER TABLE ONLY "public"."promo_read"
    ADD CONSTRAINT "promo_read_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: promo_read promo_read_userId_user_id_fk
ALTER TABLE ONLY "public"."promo_read"
    ADD CONSTRAINT "promo_read_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
