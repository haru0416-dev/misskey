-- FK CONSTRAINT: announcement_read announcement_read_announcementId_announcement_id_fk
ALTER TABLE ONLY "public"."announcement_read"
    ADD CONSTRAINT "announcement_read_announcementId_announcement_id_fk" FOREIGN KEY ("announcementId") REFERENCES "public"."announcement"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: announcement_read announcement_read_userId_user_id_fk
ALTER TABLE ONLY "public"."announcement_read"
    ADD CONSTRAINT "announcement_read_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
