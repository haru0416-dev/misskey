-- FK CONSTRAINT: registration_ticket registration_ticket_createdById_user_id_fk
ALTER TABLE ONLY "public"."registration_ticket"
    ADD CONSTRAINT "registration_ticket_createdById_user_id_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: registration_ticket registration_ticket_usedById_user_id_fk
ALTER TABLE ONLY "public"."registration_ticket"
    ADD CONSTRAINT "registration_ticket_usedById_user_id_fk" FOREIGN KEY ("usedById") REFERENCES "public"."user"("id") ON DELETE CASCADE;
