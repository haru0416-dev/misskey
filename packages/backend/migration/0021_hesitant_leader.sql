CREATE TABLE "hashtag_user" (
	"hashtagId" varchar(32) NOT NULL,
	"attached" boolean NOT NULL,
	"userId" varchar(32) NOT NULL,
	CONSTRAINT "PK_HASHTAG_USER" PRIMARY KEY("hashtagId","attached","userId")
);
--> statement-breakpoint
ALTER TABLE "hashtag_user" ADD CONSTRAINT "hashtag_user_hashtagId_hashtag_id_fk" FOREIGN KEY ("hashtagId") REFERENCES "public"."hashtag"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hashtag_user" ADD CONSTRAINT "hashtag_user_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_HASHTAG_USER_USER_ID" ON "hashtag_user" USING btree ("userId");