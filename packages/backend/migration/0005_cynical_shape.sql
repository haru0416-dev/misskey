ALTER TABLE "meta" ALTER COLUMN "repositoryUrl" SET DEFAULT 'https://github.com/haru0416-dev/misskey';--> statement-breakpoint
ALTER TABLE "meta" ALTER COLUMN "feedbackUrl" SET DEFAULT 'https://github.com/haru0416-dev/misskey/issues/new';--> statement-breakpoint
UPDATE "meta"
SET "repositoryUrl" = 'https://github.com/haru0416-dev/misskey'
WHERE "repositoryUrl" = 'https://github.com/misskey-dev/misskey';--> statement-breakpoint
UPDATE "meta"
SET "feedbackUrl" = 'https://github.com/haru0416-dev/misskey/issues/new'
WHERE "feedbackUrl" = 'https://github.com/misskey-dev/misskey/issues/new';
