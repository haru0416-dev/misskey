-- FK CONSTRAINT: user_keypair user_keypair_userId_user_id_fk
ALTER TABLE ONLY "public"."user_keypair"
    ADD CONSTRAINT "user_keypair_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
