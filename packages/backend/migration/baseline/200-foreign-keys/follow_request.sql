-- FK CONSTRAINT: follow_request follow_request_followeeId_user_id_fk
ALTER TABLE ONLY "public"."follow_request"
    ADD CONSTRAINT "follow_request_followeeId_user_id_fk" FOREIGN KEY ("followeeId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: follow_request follow_request_followerId_user_id_fk
ALTER TABLE ONLY "public"."follow_request"
    ADD CONSTRAINT "follow_request_followerId_user_id_fk" FOREIGN KEY ("followerId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
