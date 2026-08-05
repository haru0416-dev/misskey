DROP INDEX "IDX_QUEUE_OUTBOX_STATE_UPDATED_AT";--> statement-breakpoint
CREATE INDEX "IDX_QUEUE_OUTBOX_STATE_ID" ON "queue_outbox" USING btree ("state","id");