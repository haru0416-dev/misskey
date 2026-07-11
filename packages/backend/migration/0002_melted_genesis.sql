ALTER TABLE "meta" ADD COLUMN "signupRateLimitMinIntervalSeconds" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meta" ADD COLUMN "signupRateLimitMaxPerHour" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meta" ADD COLUMN "translatorProvider" varchar(32) DEFAULT 'deepl' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta" ADD COLUMN "libreTranslateApiUrl" varchar(1024);--> statement-breakpoint
ALTER TABLE "meta" ADD COLUMN "libreTranslateApiKey" varchar(1024);