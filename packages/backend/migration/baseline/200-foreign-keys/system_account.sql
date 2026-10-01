-- FK CONSTRAINT: system_account system_account_userId_user_id_fk
ALTER TABLE ONLY "public"."system_account"
    ADD CONSTRAINT "system_account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
