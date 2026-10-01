-- FK CONSTRAINT: blocking blocking_blockeeId_user_id_fk
ALTER TABLE ONLY "public"."blocking"
    ADD CONSTRAINT "blocking_blockeeId_user_id_fk" FOREIGN KEY ("blockeeId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: blocking blocking_blockerId_user_id_fk
ALTER TABLE ONLY "public"."blocking"
    ADD CONSTRAINT "blocking_blockerId_user_id_fk" FOREIGN KEY ("blockerId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
