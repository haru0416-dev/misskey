-- FK CONSTRAINT: following following_followeeId_user_id_fk
ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_followeeId_user_id_fk" FOREIGN KEY ("followeeId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: following following_followerId_user_id_fk
ALTER TABLE ONLY "public"."following"
    ADD CONSTRAINT "following_followerId_user_id_fk" FOREIGN KEY ("followerId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
