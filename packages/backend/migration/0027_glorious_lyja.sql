CREATE TABLE "follow_acceptance" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"actorUri" text NOT NULL,
	"followeeId" varchar(32) NOT NULL,
	"requestId" text,
	"followingId" varchar(32) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "follow_acceptance" ADD CONSTRAINT "follow_acceptance_followeeId_user_id_fk" FOREIGN KEY ("followeeId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_FOLLOW_ACCEPTANCE_FOLLOWEE_ID" ON "follow_acceptance" USING btree ("followeeId");