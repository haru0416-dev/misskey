-- FK CONSTRAINT: announcement_reaction announcement_reaction_announcementId_announcement_id_fk
ALTER TABLE ONLY "public"."announcement_reaction"
    ADD CONSTRAINT "announcement_reaction_announcementId_announcement_id_fk" FOREIGN KEY ("announcementId") REFERENCES "public"."announcement"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: announcement_reaction announcement_reaction_userId_user_id_fk
ALTER TABLE ONLY "public"."announcement_reaction"
    ADD CONSTRAINT "announcement_reaction_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
