-- FK CONSTRAINT: user_memo user_memo_targetUserId_user_id_fk
ALTER TABLE ONLY "public"."user_memo"
    ADD CONSTRAINT "user_memo_targetUserId_user_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: user_memo user_memo_userId_user_id_fk
ALTER TABLE ONLY "public"."user_memo"
    ADD CONSTRAINT "user_memo_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
