-- FK CONSTRAINT: antenna antenna_userId_user_id_fk
ALTER TABLE ONLY "public"."antenna"
    ADD CONSTRAINT "antenna_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: antenna antenna_userListId_user_list_id_fk
ALTER TABLE ONLY "public"."antenna"
    ADD CONSTRAINT "antenna_userListId_user_list_id_fk" FOREIGN KEY ("userListId") REFERENCES "public"."user_list"("id") ON DELETE CASCADE;
