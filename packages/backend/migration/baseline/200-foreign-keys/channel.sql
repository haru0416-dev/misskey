-- FK CONSTRAINT: channel channel_bannerId_drive_file_id_fk
ALTER TABLE ONLY "public"."channel"
    ADD CONSTRAINT "channel_bannerId_drive_file_id_fk" FOREIGN KEY ("bannerId") REFERENCES "public"."drive_file"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: channel channel_userId_user_id_fk
ALTER TABLE ONLY "public"."channel"
    ADD CONSTRAINT "channel_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE SET NULL;
