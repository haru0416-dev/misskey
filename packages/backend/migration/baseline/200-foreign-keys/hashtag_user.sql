-- FK CONSTRAINT: hashtag_user hashtag_user_hashtagId_hashtag_id_fk
ALTER TABLE ONLY "public"."hashtag_user"
    ADD CONSTRAINT "hashtag_user_hashtagId_hashtag_id_fk" FOREIGN KEY ("hashtagId") REFERENCES "public"."hashtag"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: hashtag_user hashtag_user_userId_user_id_fk
ALTER TABLE ONLY "public"."hashtag_user"
    ADD CONSTRAINT "hashtag_user_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
