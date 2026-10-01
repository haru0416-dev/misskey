-- FK CONSTRAINT: channel_muting channel_muting_channelId_channel_id_fk
ALTER TABLE ONLY "public"."channel_muting"
    ADD CONSTRAINT "channel_muting_channelId_channel_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."channel"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: channel_muting channel_muting_userId_user_id_fk
ALTER TABLE ONLY "public"."channel_muting"
    ADD CONSTRAINT "channel_muting_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
