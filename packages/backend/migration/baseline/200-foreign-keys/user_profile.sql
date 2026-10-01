-- FK CONSTRAINT: user_profile user_profile_pinnedPageId_page_id_fk
ALTER TABLE ONLY "public"."user_profile"
    ADD CONSTRAINT "user_profile_pinnedPageId_page_id_fk" FOREIGN KEY ("pinnedPageId") REFERENCES "public"."page"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: user_profile user_profile_userId_user_id_fk
ALTER TABLE ONLY "public"."user_profile"
    ADD CONSTRAINT "user_profile_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
