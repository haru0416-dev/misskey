-- FK CONSTRAINT: moderation_log moderation_log_userId_user_id_fk
ALTER TABLE ONLY "public"."moderation_log"
    ADD CONSTRAINT "moderation_log_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
