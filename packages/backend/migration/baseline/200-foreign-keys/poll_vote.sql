-- FK CONSTRAINT: poll_vote poll_vote_noteId_note_id_fk
ALTER TABLE ONLY "public"."poll_vote"
    ADD CONSTRAINT "poll_vote_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: poll_vote poll_vote_userId_user_id_fk
ALTER TABLE ONLY "public"."poll_vote"
    ADD CONSTRAINT "poll_vote_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
