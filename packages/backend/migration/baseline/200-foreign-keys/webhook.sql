-- FK CONSTRAINT: webhook webhook_userId_user_id_fk
ALTER TABLE ONLY "public"."webhook"
    ADD CONSTRAINT "webhook_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
