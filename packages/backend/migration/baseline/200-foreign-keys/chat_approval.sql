-- FK CONSTRAINT: chat_approval chat_approval_otherId_user_id_fk
ALTER TABLE ONLY "public"."chat_approval"
    ADD CONSTRAINT "chat_approval_otherId_user_id_fk" FOREIGN KEY ("otherId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: chat_approval chat_approval_userId_user_id_fk
ALTER TABLE ONLY "public"."chat_approval"
    ADD CONSTRAINT "chat_approval_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
