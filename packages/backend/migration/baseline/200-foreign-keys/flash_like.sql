-- FK CONSTRAINT: flash_like flash_like_flashId_flash_id_fk
ALTER TABLE ONLY "public"."flash_like"
    ADD CONSTRAINT "flash_like_flashId_flash_id_fk" FOREIGN KEY ("flashId") REFERENCES "public"."flash"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: flash_like flash_like_userId_user_id_fk
ALTER TABLE ONLY "public"."flash_like"
    ADD CONSTRAINT "flash_like_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
