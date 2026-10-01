-- FK CONSTRAINT: renote_muting renote_muting_muteeId_user_id_fk
ALTER TABLE ONLY "public"."renote_muting"
    ADD CONSTRAINT "renote_muting_muteeId_user_id_fk" FOREIGN KEY ("muteeId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: renote_muting renote_muting_muterId_user_id_fk
ALTER TABLE ONLY "public"."renote_muting"
    ADD CONSTRAINT "renote_muting_muterId_user_id_fk" FOREIGN KEY ("muterId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
