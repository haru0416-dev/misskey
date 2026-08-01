SET LOCAL statement_timeout = 0;--> statement-breakpoint
CREATE INDEX "IDX_USER_UPDATED_AT_DESC_NULLS_LAST" ON "user" USING btree ("updatedAt" DESC NULLS LAST);
