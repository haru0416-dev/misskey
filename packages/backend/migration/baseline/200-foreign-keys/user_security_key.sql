-- FK CONSTRAINT: user_security_key user_security_key_userId_user_id_fk
ALTER TABLE ONLY "public"."user_security_key"
    ADD CONSTRAINT "user_security_key_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
