-- FK CONSTRAINT: abuse_user_report abuse_user_report_assigneeId_user_id_fk
ALTER TABLE ONLY "public"."abuse_user_report"
    ADD CONSTRAINT "abuse_user_report_assigneeId_user_id_fk" FOREIGN KEY ("assigneeId") REFERENCES "public"."user"("id") ON DELETE SET NULL;

-- FK CONSTRAINT: abuse_user_report abuse_user_report_reporterId_user_id_fk
ALTER TABLE ONLY "public"."abuse_user_report"
    ADD CONSTRAINT "abuse_user_report_reporterId_user_id_fk" FOREIGN KEY ("reporterId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: abuse_user_report abuse_user_report_targetUserId_user_id_fk
ALTER TABLE ONLY "public"."abuse_user_report"
    ADD CONSTRAINT "abuse_user_report_targetUserId_user_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
