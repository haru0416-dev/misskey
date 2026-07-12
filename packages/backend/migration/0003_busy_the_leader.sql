CREATE TABLE "queue_outbox" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"queue" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"data" jsonb NOT NULL,
	"opts" jsonb NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IDX_QUEUE_OUTBOX_CREATED_AT" ON "queue_outbox" USING btree ("createdAt");