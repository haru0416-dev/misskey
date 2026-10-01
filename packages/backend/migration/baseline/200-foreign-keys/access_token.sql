-- FK CONSTRAINT: access_token access_token_userId_user_id_fk
ALTER TABLE ONLY "public"."access_token"
    ADD CONSTRAINT "access_token_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
