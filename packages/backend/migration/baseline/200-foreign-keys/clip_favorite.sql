-- FK CONSTRAINT: clip_favorite clip_favorite_clipId_clip_id_fk
ALTER TABLE ONLY "public"."clip_favorite"
    ADD CONSTRAINT "clip_favorite_clipId_clip_id_fk" FOREIGN KEY ("clipId") REFERENCES "public"."clip"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: clip_favorite clip_favorite_userId_user_id_fk
ALTER TABLE ONLY "public"."clip_favorite"
    ADD CONSTRAINT "clip_favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
