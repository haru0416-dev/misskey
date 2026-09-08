ALTER TABLE "meta" RENAME COLUMN "enableMcaptcha" TO "enableCap";--> statement-breakpoint
ALTER TABLE "meta" ADD COLUMN "capSiteKey" varchar(1024);--> statement-breakpoint
ALTER TABLE "meta" ADD COLUMN "capSecretKey" varchar(1024);--> statement-breakpoint
ALTER TABLE "meta" ADD COLUMN "capInstanceUrl" varchar(1024);--> statement-breakpoint
ALTER TABLE "meta" DROP COLUMN "mcaptchaSitekey";--> statement-breakpoint
ALTER TABLE "meta" DROP COLUMN "mcaptchaSecretKey";--> statement-breakpoint
ALTER TABLE "meta" DROP COLUMN "mcaptchaInstanceUrl";