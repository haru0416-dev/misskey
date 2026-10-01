-- FK CONSTRAINT: signin signin_userId_user_id_fk
ALTER TABLE ONLY "public"."signin"
    ADD CONSTRAINT "signin_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
