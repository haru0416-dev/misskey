-- FK CONSTRAINT: muting muting_muteeId_user_id_fk
ALTER TABLE ONLY "public"."muting"
    ADD CONSTRAINT "muting_muteeId_user_id_fk" FOREIGN KEY ("muteeId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: muting muting_muterId_user_id_fk
ALTER TABLE ONLY "public"."muting"
    ADD CONSTRAINT "muting_muterId_user_id_fk" FOREIGN KEY ("muterId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
