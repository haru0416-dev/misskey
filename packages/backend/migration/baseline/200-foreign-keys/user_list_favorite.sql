-- FK CONSTRAINT: user_list_favorite user_list_favorite_userId_user_id_fk
ALTER TABLE ONLY "public"."user_list_favorite"
    ADD CONSTRAINT "user_list_favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: user_list_favorite user_list_favorite_userListId_user_list_id_fk
ALTER TABLE ONLY "public"."user_list_favorite"
    ADD CONSTRAINT "user_list_favorite_userListId_user_list_id_fk" FOREIGN KEY ("userListId") REFERENCES "public"."user_list"("id") ON DELETE CASCADE;
