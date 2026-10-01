-- FK CONSTRAINT: registry_item registry_item_userId_user_id_fk
ALTER TABLE ONLY "public"."registry_item"
    ADD CONSTRAINT "registry_item_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
