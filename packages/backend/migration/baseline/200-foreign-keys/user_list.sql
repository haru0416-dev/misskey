-- FK CONSTRAINT: user_list user_list_userId_user_id_fk
ALTER TABLE ONLY "public"."user_list"
    ADD CONSTRAINT "user_list_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
