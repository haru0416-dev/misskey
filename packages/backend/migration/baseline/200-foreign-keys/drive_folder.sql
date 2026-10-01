-- FK CONSTRAINT: drive_folder drive_folder_parentId_drive_folder_id_fk
ALTER TABLE ONLY "public"."drive_folder"
    ADD CONSTRAINT "drive_folder_parentId_drive_folder_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."drive_folder"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: drive_folder drive_folder_userId_user_id_fk
ALTER TABLE ONLY "public"."drive_folder"
    ADD CONSTRAINT "drive_folder_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
