-- FK CONSTRAINT: channel_favorite channel_favorite_channelId_channel_id_fk
ALTER TABLE ONLY "public"."channel_favorite"
    ADD CONSTRAINT "channel_favorite_channelId_channel_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."channel"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: channel_favorite channel_favorite_userId_user_id_fk
ALTER TABLE ONLY "public"."channel_favorite"
    ADD CONSTRAINT "channel_favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
