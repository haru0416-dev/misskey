-- FK CONSTRAINT: clip clip_userId_user_id_fk
ALTER TABLE ONLY "public"."clip"
    ADD CONSTRAINT "clip_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
