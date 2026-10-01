-- FK CONSTRAINT: abuse_report_notification_recipient abuse_report_notification_recipient_systemWebhookId_system_webh
ALTER TABLE ONLY "public"."abuse_report_notification_recipient"
    ADD CONSTRAINT "abuse_report_notification_recipient_systemWebhookId_system_webh" FOREIGN KEY ("systemWebhookId") REFERENCES "public"."system_webhook"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: abuse_report_notification_recipient abuse_report_notification_recipient_userId_user_id_fk
ALTER TABLE ONLY "public"."abuse_report_notification_recipient"
    ADD CONSTRAINT "abuse_report_notification_recipient_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: abuse_report_notification_recipient abuse_report_notification_recipient_userId_user_profile_userId_
ALTER TABLE ONLY "public"."abuse_report_notification_recipient"
    ADD CONSTRAINT "abuse_report_notification_recipient_userId_user_profile_userId_" FOREIGN KEY ("userId") REFERENCES "public"."user_profile"("userId") ON DELETE CASCADE;
