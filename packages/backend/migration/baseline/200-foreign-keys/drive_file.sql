-- FK CONSTRAINT: drive_file drive_file_folderId_drive_folder_id_fk
ALTER TABLE ONLY "public"."drive_file"
    ADD CONSTRAINT "drive_file_folderId_drive_folder_id_fk" FOREIGN KEY ("folderId") REFERENCES "public"."drive_folder"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: drive_file drive_file_userId_user_id_fk
ALTER TABLE ONLY "public"."drive_file"
    ADD CONSTRAINT "drive_file_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE SET NULL;
