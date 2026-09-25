ALTER TABLE "access_token" DROP CONSTRAINT "access_token_appId_app_id_fk";
--> statement-breakpoint
DROP INDEX "IDX_ACCESS_TOKEN_HASH";--> statement-breakpoint
DROP INDEX "IDX_ACCESS_TOKEN_APP_ID";--> statement-breakpoint
ALTER TABLE "access_token" DROP COLUMN "hash";--> statement-breakpoint
ALTER TABLE "access_token" DROP COLUMN "appId";