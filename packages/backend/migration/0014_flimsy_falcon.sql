CREATE TABLE "announcement_reaction" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"announcementId" varchar(32) NOT NULL,
	"reaction" varchar(260) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_reaction" ADD CONSTRAINT "announcement_reaction_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reaction" ADD CONSTRAINT "announcement_reaction_announcementId_announcement_id_fk" FOREIGN KEY ("announcementId") REFERENCES "public"."announcement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_ANNOUNCEMENT_REACTION_ANNOUNCEMENT_ID" ON "announcement_reaction" USING btree ("announcementId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_ANNOUNCEMENT_REACTION_USER_ID_ANNOUNCEMENT_ID_UNIQUE" ON "announcement_reaction" USING btree ("userId","announcementId");