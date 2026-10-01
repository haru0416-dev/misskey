-- FK CONSTRAINT: sw_subscription sw_subscription_userId_user_id_fk
ALTER TABLE ONLY "public"."sw_subscription"
    ADD CONSTRAINT "sw_subscription_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
