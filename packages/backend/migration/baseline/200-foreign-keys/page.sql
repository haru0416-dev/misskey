-- FK CONSTRAINT: page page_eyeCatchingImageId_drive_file_id_fk
ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_eyeCatchingImageId_drive_file_id_fk" FOREIGN KEY ("eyeCatchingImageId") REFERENCES "public"."drive_file"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: page page_userId_user_id_fk
ALTER TABLE ONLY "public"."page"
    ADD CONSTRAINT "page_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
