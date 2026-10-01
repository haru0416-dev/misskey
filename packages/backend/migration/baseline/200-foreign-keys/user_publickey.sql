-- FK CONSTRAINT: user_publickey user_publickey_userId_user_id_fk
ALTER TABLE ONLY "public"."user_publickey"
    ADD CONSTRAINT "user_publickey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
