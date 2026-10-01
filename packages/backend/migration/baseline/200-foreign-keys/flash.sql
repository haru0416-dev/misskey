-- FK CONSTRAINT: flash flash_userId_user_id_fk
ALTER TABLE ONLY "public"."flash"
    ADD CONSTRAINT "flash_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
