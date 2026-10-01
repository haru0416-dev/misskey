-- FK CONSTRAINT: user user_avatarId_drive_file_id_fk
ALTER TABLE ONLY "public"."user"
    ADD CONSTRAINT "user_avatarId_drive_file_id_fk" FOREIGN KEY ("avatarId") REFERENCES "public"."drive_file"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: user user_bannerId_drive_file_id_fk
ALTER TABLE ONLY "public"."user"
    ADD CONSTRAINT "user_bannerId_drive_file_id_fk" FOREIGN KEY ("bannerId") REFERENCES "public"."drive_file"("id") ON DELETE SET NULL;
