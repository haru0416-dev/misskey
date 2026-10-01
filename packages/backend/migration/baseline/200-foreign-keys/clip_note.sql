-- FK CONSTRAINT: clip_note clip_note_clipId_clip_id_fk
ALTER TABLE ONLY "public"."clip_note"
    ADD CONSTRAINT "clip_note_clipId_clip_id_fk" FOREIGN KEY ("clipId") REFERENCES "public"."clip"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: clip_note clip_note_noteId_note_id_fk
ALTER TABLE ONLY "public"."clip_note"
    ADD CONSTRAINT "clip_note_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;
