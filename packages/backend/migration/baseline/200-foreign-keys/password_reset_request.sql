-- FK CONSTRAINT: password_reset_request password_reset_request_userId_user_id_fk
ALTER TABLE ONLY "public"."password_reset_request"
    ADD CONSTRAINT "password_reset_request_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
