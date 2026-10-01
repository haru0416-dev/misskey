-- FK CONSTRAINT: queue_outbox queue_outbox_coordinatorId_queue_outbox_id_fk
ALTER TABLE ONLY "public"."queue_outbox"
    ADD CONSTRAINT "queue_outbox_coordinatorId_queue_outbox_id_fk" FOREIGN KEY ("coordinatorId") REFERENCES "public"."queue_outbox"("id") ON DELETE RESTRICT;
