-- FK CONSTRAINT: follow_acceptance follow_acceptance_followeeId_user_id_fk
ALTER TABLE ONLY "public"."follow_acceptance"
    ADD CONSTRAINT "follow_acceptance_followeeId_user_id_fk" FOREIGN KEY ("followeeId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
