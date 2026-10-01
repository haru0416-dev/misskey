-- FK CONSTRAINT: meta meta_rootUserId_user_id_fk
ALTER TABLE ONLY "public"."meta"
    ADD CONSTRAINT "meta_rootUserId_user_id_fk" FOREIGN KEY ("rootUserId") REFERENCES "public"."user"("id") ON DELETE SET NULL;
