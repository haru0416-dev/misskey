CREATE TABLE "delivery_queue_cleanup" (
	"jobId" varchar(128) PRIMARY KEY NOT NULL,
	"availableAt" timestamp with time zone DEFAULT now() NOT NULL,
	"leaseToken" varchar(64),
	"leaseExpiresAt" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lastError" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IDX_DELIVERY_QUEUE_CLEANUP_AVAILABLE_AT" ON "delivery_queue_cleanup" USING btree ("availableAt","createdAt","jobId");--> statement-breakpoint
CREATE INDEX "IDX_DELIVERY_QUEUE_CLEANUP_LEASE_EXPIRES_AT" ON "delivery_queue_cleanup" USING btree ("leaseExpiresAt");