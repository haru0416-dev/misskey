DROP INDEX "IDX_QUEUE_OUTBOX_CREATED_AT";--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "kind" varchar(32) DEFAULT 'job' NOT NULL;--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "state" varchar(32) DEFAULT 'ready' NOT NULL;--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "coordinatorId" varchar(32);--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "externalJobId" varchar(128);--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "availableAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "leaseToken" varchar(64);--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "leaseExpiresAt" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "pollIntervalMs" integer DEFAULT 1000 NOT NULL;--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "deadLetterReason" varchar(32);--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "lastError" jsonb;--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD COLUMN "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
UPDATE "queue_outbox" SET
	"kind" = CASE
		WHEN "queue" = 'accountDelete' THEN 'accountDeleteCoordinator'
		WHEN "queue" = 'invalid' AND "data" ->> 'accountDeleteCoordinatorId' = "id" THEN 'accountDeleteCoordinator'
		ELSE 'job'
	END,
	"state" = CASE
		WHEN "queue" = 'deliverPending' THEN 'published'
		WHEN "queue" = 'invalid' THEN 'deadLetter'
		ELSE 'ready'
	END,
	"queue" = CASE
		WHEN "queue" IN ('deliver', 'deliverPending') THEN 'deliver'
		WHEN "queue" = 'accountDelete' THEN 'db'
		WHEN "queue" = 'invalid' AND "data" ? 'name' AND "data" ? 'data' THEN 'deliver'
		ELSE 'db'
	END,
	"coordinatorId" = CASE
		WHEN jsonb_typeof("data" -> 'coordinatorId') = 'string' THEN "data" ->> 'coordinatorId'
		ELSE NULL
	END,
	"externalJobId" = 'outbox-' || "id",
	"availableAt" = now(),
	"deadLetterReason" = CASE WHEN "queue" = 'invalid' THEN 'invalidPayload' ELSE NULL END,
	"lastError" = CASE WHEN "queue" = 'invalid' THEN jsonb_build_object('message', 'Legacy outbox payload is invalid') ELSE NULL END;--> statement-breakpoint
ALTER TABLE "queue_outbox" ADD CONSTRAINT "queue_outbox_coordinatorId_queue_outbox_id_fk" FOREIGN KEY ("coordinatorId") REFERENCES "public"."queue_outbox"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_QUEUE_OUTBOX_STATE_AVAILABLE_AT" ON "queue_outbox" USING btree ("state","availableAt","createdAt");--> statement-breakpoint
CREATE INDEX "IDX_QUEUE_OUTBOX_COORDINATOR_ID" ON "queue_outbox" USING btree ("coordinatorId");--> statement-breakpoint
CREATE INDEX "IDX_QUEUE_OUTBOX_STATE_UPDATED_AT" ON "queue_outbox" USING btree ("state","updatedAt");