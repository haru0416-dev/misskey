-- FK CONSTRAINT: channel_following channel_following_followeeId_channel_id_fk
ALTER TABLE ONLY "public"."channel_following"
    ADD CONSTRAINT "channel_following_followeeId_channel_id_fk" FOREIGN KEY ("followeeId") REFERENCES "public"."channel"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: channel_following channel_following_followerId_user_id_fk
ALTER TABLE ONLY "public"."channel_following"
    ADD CONSTRAINT "channel_following_followerId_user_id_fk" FOREIGN KEY ("followerId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
