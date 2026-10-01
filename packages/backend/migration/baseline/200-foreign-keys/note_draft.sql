-- FK CONSTRAINT: note_draft note_draft_userId_user_id_fk
ALTER TABLE ONLY "public"."note_draft"
    ADD CONSTRAINT "note_draft_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
