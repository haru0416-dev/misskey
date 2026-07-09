CREATE TYPE "public"."antenna_src_enum" AS ENUM('home', 'all', 'users', 'list', 'users_blacklist');--> statement-breakpoint
CREATE TYPE "public"."instance_suspensionstate_enum" AS ENUM('none', 'manuallySuspended', 'goneSuspended', 'autoSuspendedForNotResponding');--> statement-breakpoint
CREATE TYPE "public"."meta_sensitivemediadetection_enum" AS ENUM('none', 'all', 'local', 'remote');--> statement-breakpoint
CREATE TYPE "public"."meta_sensitivemediadetectionsensitivity_enum" AS ENUM('medium', 'low', 'high', 'veryLow', 'veryHigh');--> statement-breakpoint
CREATE TYPE "public"."note_draft_visibility_enum" AS ENUM('public', 'home', 'followers', 'specified');--> statement-breakpoint
CREATE TYPE "public"."note_visibility_enum" AS ENUM('public', 'home', 'followers', 'specified');--> statement-breakpoint
CREATE TYPE "public"."page_visibility_enum" AS ENUM('public', 'followers', 'specified');--> statement-breakpoint
CREATE TYPE "public"."poll_notevisibility_enum" AS ENUM('public', 'home', 'followers', 'specified');--> statement-breakpoint
CREATE TYPE "public"."relay_status_enum" AS ENUM('requesting', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."role_target_enum" AS ENUM('manual', 'conditional');--> statement-breakpoint
CREATE TYPE "public"."user_profile_followersvisibility_enum" AS ENUM('public', 'followers', 'private');--> statement-breakpoint
CREATE TYPE "public"."user_profile_followingvisibility_enum" AS ENUM('public', 'followers', 'private');--> statement-breakpoint
CREATE TABLE "abuse_report_notification_recipient" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"name" varchar(255) NOT NULL,
	"method" varchar(64) NOT NULL,
	"userId" varchar(32) DEFAULT null,
	"systemWebhookId" varchar(32) DEFAULT null
);
--> statement-breakpoint
CREATE TABLE "abuse_user_report" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"targetUserId" varchar(32) NOT NULL,
	"reporterId" varchar(32) NOT NULL,
	"assigneeId" varchar(32),
	"resolved" boolean DEFAULT false NOT NULL,
	"forwarded" boolean DEFAULT false NOT NULL,
	"comment" varchar(2048) NOT NULL,
	"moderationNote" varchar(8192) DEFAULT '' NOT NULL,
	"resolvedAs" varchar(128),
	"targetUserHost" varchar(128),
	"reporterHost" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "access_token" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"lastUsedAt" timestamp with time zone,
	"token" varchar(128) NOT NULL,
	"session" varchar(128),
	"hash" varchar(128) NOT NULL,
	"userId" varchar(32) NOT NULL,
	"appId" varchar(32),
	"name" varchar(128),
	"description" varchar(512),
	"iconUrl" varchar(512),
	"permission" varchar(64)[] DEFAULT '{}'::character varying[] NOT NULL,
	"fetched" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ad" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"startsAt" timestamp with time zone DEFAULT now() NOT NULL,
	"place" varchar(32) NOT NULL,
	"priority" varchar(32) NOT NULL,
	"ratio" integer DEFAULT 1 NOT NULL,
	"url" varchar(1024) NOT NULL,
	"imageUrl" varchar(1024) NOT NULL,
	"memo" varchar(8192) NOT NULL,
	"dayOfWeek" integer DEFAULT 0 NOT NULL,
	"isSensitive" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_read" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"announcementId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"updatedAt" timestamp with time zone,
	"text" varchar(8192) NOT NULL,
	"title" varchar(256) NOT NULL,
	"imageUrl" varchar(1024),
	"icon" varchar(256) DEFAULT 'info' NOT NULL,
	"display" varchar(256) DEFAULT 'normal' NOT NULL,
	"needConfirmationToRead" boolean DEFAULT false NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"forExistingUsers" boolean DEFAULT false NOT NULL,
	"silence" boolean DEFAULT false NOT NULL,
	"userId" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "antenna" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"lastUsedAt" timestamp with time zone NOT NULL,
	"userId" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"src" "antenna_src_enum" NOT NULL,
	"userListId" varchar(32),
	"users" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"keywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excludeKeywords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"caseSensitive" boolean DEFAULT false NOT NULL,
	"excludeBots" boolean DEFAULT false NOT NULL,
	"withReplies" boolean DEFAULT false NOT NULL,
	"withFile" boolean NOT NULL,
	"expression" varchar(2048),
	"isActive" boolean DEFAULT true NOT NULL,
	"localOnly" boolean DEFAULT false NOT NULL,
	"excludeNotesInSensitiveChannel" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32),
	"secret" varchar(64) NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" varchar(512) NOT NULL,
	"permission" varchar(64)[] NOT NULL,
	"callbackUrl" varchar(512)
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"token" varchar(128) NOT NULL,
	"userId" varchar(32),
	"appId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avatar_decoration" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"updatedAt" timestamp with time zone,
	"url" varchar(1024) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" varchar(2048) NOT NULL,
	"roleIdsThatCanBeUsedThisDecoration" varchar(128)[] DEFAULT '{}'::character varying[] NOT NULL,
	"category" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "blocking" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"blockeeId" varchar(32) NOT NULL,
	"blockerId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_favorite" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"channelId" varchar(32) NOT NULL,
	"userId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_following" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"followeeId" varchar(32) NOT NULL,
	"followerId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_muting" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"channelId" varchar(32) NOT NULL,
	"expiresAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "channel" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"lastNotedAt" timestamp with time zone,
	"userId" varchar(32),
	"name" varchar(128) NOT NULL,
	"description" varchar(2048),
	"bannerId" varchar(32),
	"pinnedNoteIds" varchar(128)[] DEFAULT '{}'::character varying[] NOT NULL,
	"color" varchar(16) DEFAULT '#86b300' NOT NULL,
	"isArchived" boolean DEFAULT false NOT NULL,
	"notesCount" integer DEFAULT 0 NOT NULL,
	"usersCount" integer DEFAULT 0 NOT NULL,
	"isSensitive" boolean DEFAULT false NOT NULL,
	"allowRenoteToExternal" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_approval" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"otherId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_message" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"fromUserId" varchar(32) NOT NULL,
	"toUserId" varchar(32),
	"toRoomId" varchar(32),
	"text" varchar(4096),
	"uri" varchar(512),
	"reads" varchar(32)[] DEFAULT '{}'::character varying[] NOT NULL,
	"fileId" varchar(32),
	"reactions" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_room_invitation" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"roomId" varchar(32) NOT NULL,
	"ignored" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_room_membership" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"roomId" varchar(32) NOT NULL,
	"isMuted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_room" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"ownerId" varchar(32) NOT NULL,
	"description" varchar(2048) DEFAULT '' NOT NULL,
	"isArchived" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clip_favorite" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"clipId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clip_note" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"noteId" varchar(32) NOT NULL,
	"clipId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clip" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"lastClippedAt" timestamp with time zone,
	"userId" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"isPublic" boolean DEFAULT false NOT NULL,
	"description" varchar(2048)
);
--> statement-breakpoint
CREATE TABLE "drive_file" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32),
	"userHost" varchar(128),
	"md5" varchar(32) NOT NULL,
	"name" varchar(256) NOT NULL,
	"type" varchar(128) NOT NULL,
	"size" integer NOT NULL,
	"comment" varchar(512),
	"blurhash" varchar(128),
	"properties" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"storedInternal" boolean NOT NULL,
	"url" varchar(1024) NOT NULL,
	"thumbnailUrl" varchar(512),
	"webpublicUrl" varchar(512),
	"webpublicType" varchar(128),
	"accessKey" varchar(256),
	"thumbnailAccessKey" varchar(256),
	"webpublicAccessKey" varchar(256),
	"uri" varchar(1024),
	"src" varchar(1024),
	"folderId" varchar(32),
	"isSensitive" boolean DEFAULT false NOT NULL,
	"maybeSensitive" boolean DEFAULT false NOT NULL,
	"maybePorn" boolean DEFAULT false NOT NULL,
	"isLink" boolean DEFAULT false NOT NULL,
	"requestHeaders" jsonb DEFAULT '{}'::jsonb,
	"requestIp" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "drive_folder" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"userId" varchar(32),
	"parentId" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "emoji" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"updatedAt" timestamp with time zone,
	"name" varchar(128) NOT NULL,
	"host" varchar(128),
	"category" varchar(128),
	"originalUrl" varchar(512) NOT NULL,
	"publicUrl" varchar(512) DEFAULT '' NOT NULL,
	"uri" varchar(512),
	"type" varchar(64),
	"aliases" varchar(128)[] DEFAULT '{}'::character varying[] NOT NULL,
	"license" varchar(1024),
	"localOnly" boolean DEFAULT false NOT NULL,
	"isSensitive" boolean DEFAULT false NOT NULL,
	"roleIdsThatCanBeUsedThisEmojiAsReaction" varchar(128)[] DEFAULT '{}'::character varying[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flash_like" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"flashId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flash" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"title" varchar(256) NOT NULL,
	"summary" varchar(1024) NOT NULL,
	"userId" varchar(32) NOT NULL,
	"script" varchar(65536) NOT NULL,
	"permissions" varchar(256)[] DEFAULT '{}'::character varying[] NOT NULL,
	"likedCount" integer DEFAULT 0 NOT NULL,
	"visibility" varchar(512) DEFAULT 'public' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow_request" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"followeeId" varchar(32) NOT NULL,
	"followerId" varchar(32) NOT NULL,
	"requestId" varchar(128),
	"withReplies" boolean DEFAULT false NOT NULL,
	"followerHost" varchar(128),
	"followerInbox" varchar(512),
	"followerSharedInbox" varchar(512),
	"followeeHost" varchar(128),
	"followeeInbox" varchar(512),
	"followeeSharedInbox" varchar(512)
);
--> statement-breakpoint
CREATE TABLE "following" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"followeeId" varchar(32) NOT NULL,
	"followerId" varchar(32) NOT NULL,
	"isFollowerHibernated" boolean DEFAULT false NOT NULL,
	"withReplies" boolean DEFAULT false NOT NULL,
	"notify" varchar(32),
	"followerHost" varchar(128),
	"followerInbox" varchar(512),
	"followerSharedInbox" varchar(512),
	"followeeHost" varchar(128),
	"followeeInbox" varchar(512),
	"followeeSharedInbox" varchar(512)
);
--> statement-breakpoint
CREATE TABLE "gallery_like" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"postId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gallery_post" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"title" varchar(256) NOT NULL,
	"description" varchar(2048),
	"userId" varchar(32) NOT NULL,
	"fileIds" varchar(32)[] DEFAULT '{}'::character varying[] NOT NULL,
	"isSensitive" boolean DEFAULT false NOT NULL,
	"likedCount" integer DEFAULT 0 NOT NULL,
	"tags" varchar(128)[] DEFAULT '{}'::character varying[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hashtag" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"mentionedUserIds" varchar(32)[] NOT NULL,
	"mentionedUsersCount" integer DEFAULT 0 NOT NULL,
	"mentionedLocalUserIds" varchar(32)[] NOT NULL,
	"mentionedLocalUsersCount" integer DEFAULT 0 NOT NULL,
	"mentionedRemoteUserIds" varchar(32)[] NOT NULL,
	"mentionedRemoteUsersCount" integer DEFAULT 0 NOT NULL,
	"attachedUserIds" varchar(32)[] NOT NULL,
	"attachedUsersCount" integer DEFAULT 0 NOT NULL,
	"attachedLocalUserIds" varchar(32)[] NOT NULL,
	"attachedLocalUsersCount" integer DEFAULT 0 NOT NULL,
	"attachedRemoteUserIds" varchar(32)[] NOT NULL,
	"attachedRemoteUsersCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instance" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"firstRetrievedAt" timestamp with time zone NOT NULL,
	"host" varchar(128) NOT NULL,
	"usersCount" integer DEFAULT 0 NOT NULL,
	"notesCount" integer DEFAULT 0 NOT NULL,
	"followingCount" integer DEFAULT 0 NOT NULL,
	"followersCount" integer DEFAULT 0 NOT NULL,
	"latestRequestReceivedAt" timestamp with time zone,
	"isNotResponding" boolean DEFAULT false NOT NULL,
	"notRespondingSince" timestamp with time zone,
	"suspensionState" "instance_suspensionstate_enum" DEFAULT 'none' NOT NULL,
	"softwareName" varchar(64),
	"softwareVersion" varchar(64),
	"openRegistrations" boolean,
	"name" varchar(256),
	"description" varchar(4096),
	"maintainerName" varchar(128),
	"maintainerEmail" varchar(256),
	"iconUrl" varchar(256),
	"faviconUrl" varchar(256),
	"themeColor" varchar(64),
	"infoUpdatedAt" timestamp with time zone,
	"moderationNote" varchar(16384) DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meta" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"rootUserId" varchar(32),
	"name" varchar(1024),
	"shortName" varchar(64),
	"description" varchar(1024),
	"maintainerName" varchar(1024),
	"maintainerEmail" varchar(1024),
	"disableRegistration" boolean DEFAULT true NOT NULL,
	"langs" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"pinnedUsers" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"hiddenTags" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"blockedHosts" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"sensitiveWords" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"prohibitedWords" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"prohibitedWordsForNameOfUser" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"silencedHosts" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"mediaSilencedHosts" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"themeColor" varchar(1024),
	"mascotImageUrl" varchar(1024),
	"bannerUrl" varchar(1024),
	"backgroundImageUrl" varchar(1024),
	"logoImageUrl" varchar(1024),
	"iconUrl" varchar(1024),
	"app192IconUrl" varchar(1024),
	"app512IconUrl" varchar(1024),
	"serverErrorImageUrl" varchar(1024),
	"notFoundImageUrl" varchar(1024),
	"infoImageUrl" varchar(1024),
	"cacheRemoteFiles" boolean DEFAULT false NOT NULL,
	"cacheRemoteSensitiveFiles" boolean DEFAULT true NOT NULL,
	"emailRequiredForSignup" boolean DEFAULT false NOT NULL,
	"enableHcaptcha" boolean DEFAULT false NOT NULL,
	"hcaptchaSiteKey" varchar(1024),
	"hcaptchaSecretKey" varchar(1024),
	"enableMcaptcha" boolean DEFAULT false NOT NULL,
	"mcaptchaSitekey" varchar(1024),
	"mcaptchaSecretKey" varchar(1024),
	"mcaptchaInstanceUrl" varchar(1024),
	"enableRecaptcha" boolean DEFAULT false NOT NULL,
	"recaptchaSiteKey" varchar(1024),
	"recaptchaSecretKey" varchar(1024),
	"enableTurnstile" boolean DEFAULT false NOT NULL,
	"turnstileSiteKey" varchar(1024),
	"turnstileSecretKey" varchar(1024),
	"enableTestcaptcha" boolean DEFAULT false NOT NULL,
	"sensitiveMediaDetection" "meta_sensitivemediadetection_enum" DEFAULT 'none' NOT NULL,
	"sensitiveMediaDetectionSensitivity" "meta_sensitivemediadetectionsensitivity_enum" DEFAULT 'medium' NOT NULL,
	"setSensitiveFlagAutomatically" boolean DEFAULT false NOT NULL,
	"enableSensitiveMediaDetectionForVideos" boolean DEFAULT false NOT NULL,
	"sensitiveMediaDetectionApiUrl" varchar(1024),
	"sensitiveMediaDetectionApiKey" varchar(1024),
	"sensitiveMediaDetectionTimeout" integer DEFAULT 60000 NOT NULL,
	"sensitiveMediaDetectionMaxImagesPerRequest" integer DEFAULT 4 NOT NULL,
	"enableEmail" boolean DEFAULT false NOT NULL,
	"email" varchar(1024),
	"smtpSecure" boolean DEFAULT false NOT NULL,
	"smtpHost" varchar(1024),
	"smtpPort" integer,
	"smtpUser" varchar(1024),
	"smtpPass" varchar(1024),
	"enableServiceWorker" boolean DEFAULT false NOT NULL,
	"swPublicKey" varchar(1024),
	"swPrivateKey" varchar(1024),
	"deeplAuthKey" varchar(1024),
	"deeplIsPro" boolean DEFAULT false NOT NULL,
	"termsOfServiceUrl" varchar(1024),
	"repositoryUrl" varchar(1024) DEFAULT 'https://github.com/misskey-dev/misskey',
	"feedbackUrl" varchar(1024) DEFAULT 'https://github.com/misskey-dev/misskey/issues/new',
	"impressumUrl" varchar(1024),
	"privacyPolicyUrl" varchar(1024),
	"inquiryUrl" varchar(1024),
	"defaultLightTheme" varchar(8192),
	"defaultDarkTheme" varchar(8192),
	"useObjectStorage" boolean DEFAULT false NOT NULL,
	"objectStorageBucket" varchar(1024),
	"objectStoragePrefix" varchar(1024),
	"objectStorageBaseUrl" varchar(1024),
	"objectStorageEndpoint" varchar(1024),
	"objectStorageRegion" varchar(1024),
	"objectStorageAccessKey" varchar(1024),
	"objectStorageSecretKey" varchar(1024),
	"objectStoragePort" integer,
	"objectStorageUseSSL" boolean DEFAULT true NOT NULL,
	"objectStorageUseProxy" boolean DEFAULT true NOT NULL,
	"objectStorageSetPublicRead" boolean DEFAULT false NOT NULL,
	"objectStorageS3ForcePathStyle" boolean DEFAULT true NOT NULL,
	"enableIpLogging" boolean DEFAULT false NOT NULL,
	"enableActiveEmailValidation" boolean DEFAULT true NOT NULL,
	"enableVerifymailApi" boolean DEFAULT false NOT NULL,
	"verifymailAuthKey" varchar(1024),
	"enableTruemailApi" boolean DEFAULT false NOT NULL,
	"truemailInstance" varchar(1024),
	"truemailAuthKey" varchar(1024),
	"enableChartsForRemoteUser" boolean DEFAULT true NOT NULL,
	"enableChartsForFederatedInstances" boolean DEFAULT true NOT NULL,
	"enableStatsForFederatedInstances" boolean DEFAULT true NOT NULL,
	"enableServerMachineStats" boolean DEFAULT false NOT NULL,
	"enableIdenticonGeneration" boolean DEFAULT true NOT NULL,
	"policies" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"serverRules" varchar(280)[] DEFAULT '{}'::character varying[] NOT NULL,
	"manifestJsonOverride" varchar(8192) DEFAULT '{}' NOT NULL,
	"bannedEmailDomains" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"preservedUsernames" varchar(1024)[] DEFAULT '{"admin","administrator","root","system","maintainer","host","mod","moderator","owner","superuser","staff","auth","i","me","everyone","all","mention","mentions","example","user","users","account","accounts","official","help","helps","support","supports","info","information","informations","announce","announces","announcement","announcements","notice","notification","notifications","dev","developer","developers","tech","misskey"}' NOT NULL,
	"enableFanoutTimeline" boolean DEFAULT true NOT NULL,
	"enableFanoutTimelineDbFallback" boolean DEFAULT true NOT NULL,
	"perLocalUserUserTimelineCacheMax" integer DEFAULT 300 NOT NULL,
	"perRemoteUserUserTimelineCacheMax" integer DEFAULT 100 NOT NULL,
	"perUserHomeTimelineCacheMax" integer DEFAULT 300 NOT NULL,
	"perUserListTimelineCacheMax" integer DEFAULT 300 NOT NULL,
	"enableReactionsBuffering" boolean DEFAULT false NOT NULL,
	"notesPerOneAd" integer DEFAULT 0 NOT NULL,
	"urlPreviewEnabled" boolean DEFAULT true NOT NULL,
	"urlPreviewAllowRedirect" boolean DEFAULT true NOT NULL,
	"urlPreviewTimeout" integer DEFAULT 10000 NOT NULL,
	"urlPreviewMaximumContentLength" bigint DEFAULT 10485760 NOT NULL,
	"urlPreviewRequireContentLength" boolean DEFAULT false NOT NULL,
	"urlPreviewSummaryProxyUrl" varchar(1024),
	"urlPreviewUserAgent" varchar(1024),
	"federation" varchar(128) DEFAULT 'none' NOT NULL,
	"federationHosts" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"ugcVisibilityForVisitor" varchar(128) DEFAULT 'local' NOT NULL,
	"googleAnalyticsMeasurementId" varchar(64),
	"deliverSuspendedSoftware" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"singleUserMode" boolean DEFAULT false NOT NULL,
	"proxyRemoteFiles" boolean DEFAULT true NOT NULL,
	"signToActivityPubGet" boolean DEFAULT true NOT NULL,
	"allowExternalApRedirect" boolean DEFAULT true NOT NULL,
	"enableRemoteNotesCleaning" boolean DEFAULT false NOT NULL,
	"remoteNotesCleaningMaxProcessingDurationInMinutes" integer DEFAULT 60 NOT NULL,
	"remoteNotesCleaningExpiryDaysForEachNotes" integer DEFAULT 90 NOT NULL,
	"showRoleBadgesOfRemoteUsers" boolean DEFAULT false NOT NULL,
	"clientOptions" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_log" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"type" varchar(128) NOT NULL,
	"info" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "muting" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone,
	"muteeId" varchar(32) NOT NULL,
	"muterId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_draft" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"replyId" varchar(32),
	"renoteId" varchar(32),
	"text" text,
	"cw" varchar(512),
	"userId" varchar(32) NOT NULL,
	"localOnly" boolean DEFAULT false NOT NULL,
	"reactionAcceptance" varchar(64),
	"visibility" "note_draft_visibility_enum" NOT NULL,
	"fileIds" varchar(32)[] DEFAULT '{}'::character varying[] NOT NULL,
	"visibleUserIds" varchar(32)[] DEFAULT '{}'::character varying[] NOT NULL,
	"hashtag" varchar(128),
	"channelId" varchar(32),
	"hasPoll" boolean DEFAULT false NOT NULL,
	"pollChoices" varchar(256)[] DEFAULT '{}'::character varying[] NOT NULL,
	"pollMultiple" boolean NOT NULL,
	"pollExpiresAt" timestamp with time zone,
	"pollExpiredAfter" bigint,
	"scheduledAt" timestamp with time zone,
	"isActuallyScheduled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_favorite" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"noteId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_reaction" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"noteId" varchar(32) NOT NULL,
	"reaction" varchar(260) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_thread_muting" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"threadId" varchar(256) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"replyId" varchar(32),
	"renoteId" varchar(32),
	"threadId" varchar(256),
	"text" text,
	"name" varchar(256),
	"cw" varchar(512),
	"userId" varchar(32) NOT NULL,
	"localOnly" boolean DEFAULT false NOT NULL,
	"reactionAcceptance" varchar(64),
	"renoteCount" smallint DEFAULT 0 NOT NULL,
	"repliesCount" smallint DEFAULT 0 NOT NULL,
	"clippedCount" smallint DEFAULT 0 NOT NULL,
	"pageCount" smallint DEFAULT 0 NOT NULL,
	"reactions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"visibility" "note_visibility_enum" NOT NULL,
	"uri" varchar(512),
	"url" varchar(512),
	"fileIds" varchar(32)[] DEFAULT '{}'::character varying[] NOT NULL,
	"attachedFileTypes" varchar(256)[] DEFAULT '{}'::character varying[] NOT NULL,
	"visibleUserIds" varchar(32)[] DEFAULT '{}'::character varying[] NOT NULL,
	"mentions" varchar(32)[] DEFAULT '{}'::character varying[] NOT NULL,
	"mentionedRemoteUsers" text DEFAULT '[]' NOT NULL,
	"reactionAndUserPairCache" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"emojis" varchar(128)[] DEFAULT '{}'::character varying[] NOT NULL,
	"tags" varchar(128)[] DEFAULT '{}'::character varying[] NOT NULL,
	"hasPoll" boolean DEFAULT false NOT NULL,
	"channelId" varchar(32),
	"userHost" varchar(128),
	"replyUserId" varchar(32),
	"replyUserHost" varchar(128),
	"renoteUserId" varchar(32),
	"renoteUserHost" varchar(128),
	"renoteChannelId" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "page_like" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"pageId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"title" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"summary" varchar(256),
	"alignCenter" boolean NOT NULL,
	"hideTitleWhenPinned" boolean DEFAULT false NOT NULL,
	"font" varchar(32) NOT NULL,
	"userId" varchar(32) NOT NULL,
	"eyeCatchingImageId" varchar(32),
	"content" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"script" varchar(16384) DEFAULT '' NOT NULL,
	"visibility" "page_visibility_enum" NOT NULL,
	"visibleUserIds" varchar(32)[] DEFAULT '{}'::character varying[] NOT NULL,
	"likedCount" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_request" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"token" varchar(256) NOT NULL,
	"userId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll_vote" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"noteId" varchar(32) NOT NULL,
	"choice" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "poll" (
	"noteId" varchar(32) PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone,
	"multiple" boolean NOT NULL,
	"choices" varchar(256)[] DEFAULT '{}'::character varying[] NOT NULL,
	"votes" integer[] NOT NULL,
	"noteVisibility" "poll_notevisibility_enum" NOT NULL,
	"userId" varchar(32) NOT NULL,
	"userHost" varchar(128),
	"channelId" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "promo_note" (
	"noteId" varchar(32) PRIMARY KEY NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"userId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_read" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"noteId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_ticket" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"expiresAt" timestamp with time zone,
	"createdById" varchar(32),
	"usedById" varchar(32),
	"usedAt" timestamp with time zone,
	"pendingUserId" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "registry_item" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"userId" varchar(32) NOT NULL,
	"key" varchar(1024) NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb,
	"scope" varchar(1024)[] DEFAULT '{}'::character varying[] NOT NULL,
	"domain" varchar(512)
);
--> statement-breakpoint
CREATE TABLE "relay" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"inbox" varchar(512) NOT NULL,
	"status" "relay_status_enum" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renote_muting" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"muteeId" varchar(32) NOT NULL,
	"muterId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "retention_aggregation" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"dateKey" varchar(512) NOT NULL,
	"userIds" varchar(32)[] NOT NULL,
	"usersCount" integer NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_assignment" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"roleId" varchar(32) NOT NULL,
	"expiresAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"updatedAt" timestamp with time zone NOT NULL,
	"lastUsedAt" timestamp with time zone NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" varchar(1024) NOT NULL,
	"color" varchar(256),
	"iconUrl" varchar(512),
	"target" "role_target_enum" DEFAULT 'manual' NOT NULL,
	"condFormula" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"isPublic" boolean DEFAULT false NOT NULL,
	"asBadge" boolean DEFAULT false NOT NULL,
	"isModerator" boolean DEFAULT false NOT NULL,
	"isAdministrator" boolean DEFAULT false NOT NULL,
	"isExplorable" boolean DEFAULT false NOT NULL,
	"preserveAssignmentOnMoveAccount" boolean DEFAULT false NOT NULL,
	"canEditMembersByModerator" boolean DEFAULT false NOT NULL,
	"displayOrder" integer DEFAULT 0 NOT NULL,
	"policies" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "signin" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"ip" varchar(128) NOT NULL,
	"headers" jsonb NOT NULL,
	"success" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sw_subscription" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"endpoint" varchar(512) NOT NULL,
	"auth" varchar(256) NOT NULL,
	"publickey" varchar(128) NOT NULL,
	"sendReadMessage" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_account" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"type" varchar(256) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_webhook" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"latestSentAt" timestamp with time zone,
	"latestStatus" integer,
	"name" varchar(255) NOT NULL,
	"on" varchar(128)[] DEFAULT '{}'::character varying[] NOT NULL,
	"url" varchar(1024) NOT NULL,
	"secret" varchar(1024) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "used_username" (
	"username" varchar(128) PRIMARY KEY NOT NULL,
	"createdAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_ip" (
	"id" serial PRIMARY KEY NOT NULL,
	"createdAt" timestamp with time zone NOT NULL,
	"userId" varchar(32) NOT NULL,
	"ip" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_keypair" (
	"userId" varchar(32) PRIMARY KEY NOT NULL,
	"publicKey" varchar(4096) NOT NULL,
	"privateKey" varchar(4096) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_list_favorite" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"userListId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_list_membership" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"userListId" varchar(32) NOT NULL,
	"withReplies" boolean DEFAULT false NOT NULL,
	"userListUserId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_list" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"isPublic" boolean DEFAULT false NOT NULL,
	"name" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_memo" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"targetUserId" varchar(32) NOT NULL,
	"memo" varchar(2048) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_note_pining" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"noteId" varchar(32) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_pending" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"code" varchar(128) NOT NULL,
	"username" varchar(128) NOT NULL,
	"email" varchar(128) NOT NULL,
	"password" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"userId" varchar(32) PRIMARY KEY NOT NULL,
	"location" varchar(128),
	"birthday" char(10),
	"description" varchar(2048),
	"followedMessage" varchar(256),
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verifiedLinks" varchar[] DEFAULT '{}'::character varying[] NOT NULL,
	"lang" varchar(32),
	"url" varchar(512),
	"email" varchar(128),
	"emailVerifyCode" varchar(128),
	"emailVerified" boolean DEFAULT false NOT NULL,
	"emailNotificationTypes" jsonb DEFAULT '["follow","receiveFollowRequest"]'::jsonb NOT NULL,
	"publicReactions" boolean DEFAULT true NOT NULL,
	"followingVisibility" "user_profile_followingvisibility_enum" DEFAULT 'public' NOT NULL,
	"followersVisibility" "user_profile_followersvisibility_enum" DEFAULT 'public' NOT NULL,
	"twoFactorTempSecret" varchar(128),
	"twoFactorSecret" varchar(128),
	"twoFactorBackupSecret" varchar[],
	"twoFactorEnabled" boolean DEFAULT false NOT NULL,
	"securityKeysAvailable" boolean DEFAULT false NOT NULL,
	"usePasswordLessLogin" boolean DEFAULT false NOT NULL,
	"password" varchar(128),
	"moderationNote" varchar(8192) DEFAULT '' NOT NULL,
	"autoAcceptFollowed" boolean DEFAULT false NOT NULL,
	"noCrawle" boolean DEFAULT false NOT NULL,
	"preventAiLearning" boolean DEFAULT true NOT NULL,
	"alwaysMarkNsfw" boolean DEFAULT false NOT NULL,
	"autoSensitive" boolean DEFAULT false NOT NULL,
	"carefulBot" boolean DEFAULT false NOT NULL,
	"injectFeaturedNote" boolean DEFAULT true NOT NULL,
	"receiveAnnouncementEmail" boolean DEFAULT true NOT NULL,
	"pinnedPageId" varchar(32),
	"enableWordMute" boolean DEFAULT false NOT NULL,
	"mutedWords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hardMutedWords" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mutedInstances" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notificationRecieveConfig" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"loggedInDates" varchar(32)[] DEFAULT '{}'::character varying[] NOT NULL,
	"achievements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"userHost" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "user_publickey" (
	"userId" varchar(32) PRIMARY KEY NOT NULL,
	"keyId" varchar(256) NOT NULL,
	"keyPem" varchar(4096) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_security_key" (
	"id" varchar PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"name" varchar(30) NOT NULL,
	"publicKey" varchar NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"lastUsed" timestamp with time zone DEFAULT now() NOT NULL,
	"credentialDeviceType" varchar(32),
	"credentialBackedUp" boolean,
	"transports" varchar(32)[]
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"updatedAt" timestamp with time zone,
	"lastFetchedAt" timestamp with time zone,
	"lastActiveDate" timestamp with time zone,
	"hideOnlineStatus" boolean DEFAULT false NOT NULL,
	"username" varchar(128) NOT NULL,
	"usernameLower" varchar(128) NOT NULL,
	"name" varchar(128),
	"followersCount" integer DEFAULT 0 NOT NULL,
	"followingCount" integer DEFAULT 0 NOT NULL,
	"movedToUri" varchar(512),
	"movedAt" timestamp with time zone,
	"alsoKnownAs" text,
	"notesCount" integer DEFAULT 0 NOT NULL,
	"avatarId" varchar(32),
	"bannerId" varchar(32),
	"avatarUrl" varchar(1024),
	"bannerUrl" varchar(512),
	"avatarBlurhash" varchar(128),
	"bannerBlurhash" varchar(128),
	"avatarDecorations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" varchar(128)[] DEFAULT '{}'::character varying[] NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"isSuspended" boolean DEFAULT false NOT NULL,
	"isLocked" boolean DEFAULT false NOT NULL,
	"isBot" boolean DEFAULT false NOT NULL,
	"isCat" boolean DEFAULT false NOT NULL,
	"isExplorable" boolean DEFAULT true NOT NULL,
	"isHibernated" boolean DEFAULT false NOT NULL,
	"requireSigninToViewContents" boolean DEFAULT false NOT NULL,
	"makeNotesFollowersOnlyBefore" integer,
	"makeNotesHiddenBefore" integer,
	"isDeleted" boolean DEFAULT false NOT NULL,
	"emojis" varchar(128)[] DEFAULT '{}'::character varying[] NOT NULL,
	"chatScope" varchar(128) DEFAULT 'mutual' NOT NULL,
	"host" varchar(128),
	"inbox" varchar(512),
	"sharedInbox" varchar(512),
	"featured" varchar(512),
	"uri" varchar(512),
	"followersUri" varchar(512),
	"token" char(16)
);
--> statement-breakpoint
CREATE TABLE "webhook" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"userId" varchar(32) NOT NULL,
	"name" varchar(128) NOT NULL,
	"on" varchar(128)[] DEFAULT '{}'::character varying[] NOT NULL,
	"url" varchar(1024) NOT NULL,
	"secret" varchar(1024) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"latestSentAt" timestamp with time zone,
	"latestStatus" integer
);
--> statement-breakpoint
ALTER TABLE "abuse_report_notification_recipient" ADD CONSTRAINT "abuse_report_notification_recipient_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_report_notification_recipient" ADD CONSTRAINT "abuse_report_notification_recipient_systemWebhookId_system_webhook_id_fk" FOREIGN KEY ("systemWebhookId") REFERENCES "public"."system_webhook"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_report_notification_recipient" ADD CONSTRAINT "abuse_report_notification_recipient_userId_user_profile_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."user_profile"("userId") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_user_report" ADD CONSTRAINT "abuse_user_report_targetUserId_user_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_user_report" ADD CONSTRAINT "abuse_user_report_reporterId_user_id_fk" FOREIGN KEY ("reporterId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_user_report" ADD CONSTRAINT "abuse_user_report_assigneeId_user_id_fk" FOREIGN KEY ("assigneeId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_token" ADD CONSTRAINT "access_token_appId_app_id_fk" FOREIGN KEY ("appId") REFERENCES "public"."app"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_read" ADD CONSTRAINT "announcement_read_announcementId_announcement_id_fk" FOREIGN KEY ("announcementId") REFERENCES "public"."announcement"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "antenna" ADD CONSTRAINT "antenna_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "antenna" ADD CONSTRAINT "antenna_userListId_user_list_id_fk" FOREIGN KEY ("userListId") REFERENCES "public"."user_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app" ADD CONSTRAINT "app_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_appId_app_id_fk" FOREIGN KEY ("appId") REFERENCES "public"."app"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocking" ADD CONSTRAINT "blocking_blockeeId_user_id_fk" FOREIGN KEY ("blockeeId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocking" ADD CONSTRAINT "blocking_blockerId_user_id_fk" FOREIGN KEY ("blockerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_favorite" ADD CONSTRAINT "channel_favorite_channelId_channel_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_favorite" ADD CONSTRAINT "channel_favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_following" ADD CONSTRAINT "channel_following_followeeId_channel_id_fk" FOREIGN KEY ("followeeId") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_following" ADD CONSTRAINT "channel_following_followerId_user_id_fk" FOREIGN KEY ("followerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_muting" ADD CONSTRAINT "channel_muting_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_muting" ADD CONSTRAINT "channel_muting_channelId_channel_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel" ADD CONSTRAINT "channel_bannerId_drive_file_id_fk" FOREIGN KEY ("bannerId") REFERENCES "public"."drive_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_approval" ADD CONSTRAINT "chat_approval_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_approval" ADD CONSTRAINT "chat_approval_otherId_user_id_fk" FOREIGN KEY ("otherId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_fromUserId_user_id_fk" FOREIGN KEY ("fromUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_toUserId_user_id_fk" FOREIGN KEY ("toUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_toRoomId_chat_room_id_fk" FOREIGN KEY ("toRoomId") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_message" ADD CONSTRAINT "chat_message_fileId_drive_file_id_fk" FOREIGN KEY ("fileId") REFERENCES "public"."drive_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_invitation" ADD CONSTRAINT "chat_room_invitation_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_invitation" ADD CONSTRAINT "chat_room_invitation_roomId_chat_room_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_membership" ADD CONSTRAINT "chat_room_membership_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room_membership" ADD CONSTRAINT "chat_room_membership_roomId_chat_room_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chat_room"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_room" ADD CONSTRAINT "chat_room_ownerId_user_id_fk" FOREIGN KEY ("ownerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_favorite" ADD CONSTRAINT "clip_favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_favorite" ADD CONSTRAINT "clip_favorite_clipId_clip_id_fk" FOREIGN KEY ("clipId") REFERENCES "public"."clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_note" ADD CONSTRAINT "clip_note_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip_note" ADD CONSTRAINT "clip_note_clipId_clip_id_fk" FOREIGN KEY ("clipId") REFERENCES "public"."clip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clip" ADD CONSTRAINT "clip_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_file" ADD CONSTRAINT "drive_file_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_file" ADD CONSTRAINT "drive_file_folderId_drive_folder_id_fk" FOREIGN KEY ("folderId") REFERENCES "public"."drive_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_folder" ADD CONSTRAINT "drive_folder_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_folder" ADD CONSTRAINT "drive_folder_parentId_drive_folder_id_fk" FOREIGN KEY ("parentId") REFERENCES "public"."drive_folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_like" ADD CONSTRAINT "flash_like_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash_like" ADD CONSTRAINT "flash_like_flashId_flash_id_fk" FOREIGN KEY ("flashId") REFERENCES "public"."flash"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flash" ADD CONSTRAINT "flash_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_request" ADD CONSTRAINT "follow_request_followeeId_user_id_fk" FOREIGN KEY ("followeeId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_request" ADD CONSTRAINT "follow_request_followerId_user_id_fk" FOREIGN KEY ("followerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "following" ADD CONSTRAINT "following_followeeId_user_id_fk" FOREIGN KEY ("followeeId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "following" ADD CONSTRAINT "following_followerId_user_id_fk" FOREIGN KEY ("followerId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_like" ADD CONSTRAINT "gallery_like_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_like" ADD CONSTRAINT "gallery_like_postId_gallery_post_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."gallery_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gallery_post" ADD CONSTRAINT "gallery_post_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta" ADD CONSTRAINT "meta_rootUserId_user_id_fk" FOREIGN KEY ("rootUserId") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_log" ADD CONSTRAINT "moderation_log_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muting" ADD CONSTRAINT "muting_muteeId_user_id_fk" FOREIGN KEY ("muteeId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "muting" ADD CONSTRAINT "muting_muterId_user_id_fk" FOREIGN KEY ("muterId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_draft" ADD CONSTRAINT "note_draft_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_favorite" ADD CONSTRAINT "note_favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_favorite" ADD CONSTRAINT "note_favorite_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_reaction" ADD CONSTRAINT "note_reaction_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_reaction" ADD CONSTRAINT "note_reaction_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_thread_muting" ADD CONSTRAINT "note_thread_muting_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_channelId_channel_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."channel"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_like" ADD CONSTRAINT "page_like_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_like" ADD CONSTRAINT "page_like_pageId_page_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."page"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page" ADD CONSTRAINT "page_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page" ADD CONSTRAINT "page_eyeCatchingImageId_drive_file_id_fk" FOREIGN KEY ("eyeCatchingImageId") REFERENCES "public"."drive_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_request" ADD CONSTRAINT "password_reset_request_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll" ADD CONSTRAINT "poll_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_note" ADD CONSTRAINT "promo_note_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_read" ADD CONSTRAINT "promo_read_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promo_read" ADD CONSTRAINT "promo_read_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_ticket" ADD CONSTRAINT "registration_ticket_createdById_user_id_fk" FOREIGN KEY ("createdById") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_ticket" ADD CONSTRAINT "registration_ticket_usedById_user_id_fk" FOREIGN KEY ("usedById") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registry_item" ADD CONSTRAINT "registry_item_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renote_muting" ADD CONSTRAINT "renote_muting_muteeId_user_id_fk" FOREIGN KEY ("muteeId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renote_muting" ADD CONSTRAINT "renote_muting_muterId_user_id_fk" FOREIGN KEY ("muterId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_roleId_role_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signin" ADD CONSTRAINT "signin_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sw_subscription" ADD CONSTRAINT "sw_subscription_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_account" ADD CONSTRAINT "system_account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_keypair" ADD CONSTRAINT "user_keypair_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_list_favorite" ADD CONSTRAINT "user_list_favorite_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_list_favorite" ADD CONSTRAINT "user_list_favorite_userListId_user_list_id_fk" FOREIGN KEY ("userListId") REFERENCES "public"."user_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_list_membership" ADD CONSTRAINT "user_list_membership_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_list_membership" ADD CONSTRAINT "user_list_membership_userListId_user_list_id_fk" FOREIGN KEY ("userListId") REFERENCES "public"."user_list"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_list" ADD CONSTRAINT "user_list_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memo" ADD CONSTRAINT "user_memo_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_memo" ADD CONSTRAINT "user_memo_targetUserId_user_id_fk" FOREIGN KEY ("targetUserId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_note_pining" ADD CONSTRAINT "user_note_pining_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_note_pining" ADD CONSTRAINT "user_note_pining_noteId_note_id_fk" FOREIGN KEY ("noteId") REFERENCES "public"."note"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_pinnedPageId_page_id_fk" FOREIGN KEY ("pinnedPageId") REFERENCES "public"."page"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_publickey" ADD CONSTRAINT "user_publickey_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_security_key" ADD CONSTRAINT "user_security_key_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_avatarId_drive_file_id_fk" FOREIGN KEY ("avatarId") REFERENCES "public"."drive_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_bannerId_drive_file_id_fk" FOREIGN KEY ("bannerId") REFERENCES "public"."drive_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook" ADD CONSTRAINT "webhook_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_abuse_report_notification_recipient_isActive" ON "abuse_report_notification_recipient" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "IDX_abuse_report_notification_recipient_method" ON "abuse_report_notification_recipient" USING btree ("method");--> statement-breakpoint
CREATE INDEX "IDX_abuse_report_notification_recipient_userId" ON "abuse_report_notification_recipient" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_abuse_report_notification_recipient_systemWebhookId" ON "abuse_report_notification_recipient" USING btree ("systemWebhookId");--> statement-breakpoint
CREATE INDEX "IDX_a9021cc2e1feb5f72d3db6e9f5" ON "abuse_user_report" USING btree ("targetUserId");--> statement-breakpoint
CREATE INDEX "IDX_04cc96756f89d0b7f9473e8cdf" ON "abuse_user_report" USING btree ("reporterId");--> statement-breakpoint
CREATE INDEX "IDX_2b15aaf4a0dc5be3499af7ab6a" ON "abuse_user_report" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "IDX_4ebbf7f93cdc10e8d1ef2fc6cd" ON "abuse_user_report" USING btree ("targetUserHost");--> statement-breakpoint
CREATE INDEX "IDX_f8d8b93740ad12c4ce8213a199" ON "abuse_user_report" USING btree ("reporterHost");--> statement-breakpoint
CREATE INDEX "IDX_ABUSE_USER_REPORT_RESOLVED_ID" ON "abuse_user_report" USING btree ("resolved","id");--> statement-breakpoint
CREATE INDEX "IDX_ABUSE_USER_REPORT_TARGET_HOST_ID" ON "abuse_user_report" USING btree ("targetUserHost","id");--> statement-breakpoint
CREATE INDEX "IDX_ABUSE_USER_REPORT_REPORTER_HOST_ID" ON "abuse_user_report" USING btree ("reporterHost","id");--> statement-breakpoint
CREATE INDEX "IDX_ABUSE_USER_REPORT_ASSIGNEE_ID" ON "abuse_user_report" USING btree ("assigneeId");--> statement-breakpoint
CREATE INDEX "IDX_70ba8f6af34bc924fc9e12adb8" ON "access_token" USING btree ("token");--> statement-breakpoint
CREATE INDEX "IDX_bf3a053c07d9fb5d87317c56ee" ON "access_token" USING btree ("session");--> statement-breakpoint
CREATE INDEX "IDX_64c327441248bae40f7d92f34f" ON "access_token" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "IDX_9949557d0e1b2c19e5344c171e" ON "access_token" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_ACCESS_TOKEN_APP_ID" ON "access_token" USING btree ("appId");--> statement-breakpoint
CREATE INDEX "IDX_2da24ce20ad209f1d9dc032457" ON "ad" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "IDX_3fcc2c589eaefc205e0714b99c" ON "ad" USING btree ("startsAt");--> statement-breakpoint
CREATE INDEX "IDX_8288151386172b8109f7239ab2" ON "announcement_read" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_603a7b1e7aa0533c6c88e9bfaf" ON "announcement_read" USING btree ("announcementId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_924fa71815cfa3941d003702a0" ON "announcement_read" USING btree ("userId","announcementId");--> statement-breakpoint
CREATE INDEX "IDX_bc1afcc8ef7e9400cdc3c0a87e" ON "announcement" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "IDX_da795d3a83187e8832005ba19d" ON "announcement" USING btree ("forExistingUsers");--> statement-breakpoint
CREATE INDEX "IDX_7b8d9225168e962f94ea517e00" ON "announcement" USING btree ("silence");--> statement-breakpoint
CREATE INDEX "IDX_fd25dfe3da37df1715f11ba6ec" ON "announcement" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_084c2abb8948ef59a37dce6ac1" ON "antenna" USING btree ("lastUsedAt");--> statement-breakpoint
CREATE INDEX "IDX_6446c571a0e8d0f05f01c78909" ON "antenna" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_36ef5192a1ce55ed0e40aa4db5" ON "antenna" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "IDX_ANTENNA_USER_LIST_ID" ON "antenna" USING btree ("userListId");--> statement-breakpoint
CREATE INDEX "IDX_3f5b0899ef90527a3462d7c2cb" ON "app" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_f49922d511d666848f250663c4" ON "app" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "IDX_62cb09e1129f6ec024ef66e183" ON "auth_session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "IDX_AUTH_SESSION_USER_ID" ON "auth_session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_AUTH_SESSION_APP_ID" ON "auth_session" USING btree ("appId");--> statement-breakpoint
CREATE INDEX "IDX_2cd4a2743a99671308f5417759" ON "blocking" USING btree ("blockeeId");--> statement-breakpoint
CREATE INDEX "IDX_0627125f1a8a42c9a1929edb55" ON "blocking" USING btree ("blockerId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_98a1bc5cb30dfd159de056549f" ON "blocking" USING btree ("blockerId","blockeeId");--> statement-breakpoint
CREATE INDEX "IDX_d3ca0db011b75ac2a940a2337d" ON "channel_favorite" USING btree ("channelId");--> statement-breakpoint
CREATE INDEX "IDX_8302bd27226605ece14842fb25" ON "channel_favorite" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_c71faf11f0a28a5c0bb506203c" ON "channel_favorite" USING btree ("userId","channelId");--> statement-breakpoint
CREATE INDEX "IDX_0e43068c3f92cab197c3d3cd86" ON "channel_following" USING btree ("followeeId");--> statement-breakpoint
CREATE INDEX "IDX_6d8084ec9496e7334a4602707e" ON "channel_following" USING btree ("followerId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_2e230dd45a10e671d781d99f3e" ON "channel_following" USING btree ("followerId","followeeId");--> statement-breakpoint
CREATE INDEX "IDX_34415e3062ae7a94617496e81c" ON "channel_muting" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_4d534d7177fc59879d942e96d0" ON "channel_muting" USING btree ("channelId");--> statement-breakpoint
CREATE INDEX "IDX_6dd314e96806b7df65ddadff72" ON "channel_muting" USING btree ("expiresAt");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_CHANNEL_MUTING_USER_ID_CHANNEL_ID_UNIQUE" ON "channel_muting" USING btree ("userId","channelId");--> statement-breakpoint
CREATE INDEX "IDX_29ef80c6f13bcea998447fce43" ON "channel" USING btree ("lastNotedAt");--> statement-breakpoint
CREATE INDEX "IDX_823bae55bd81b3be6e05cff438" ON "channel" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_cc7c72974f1b2f385a8921f094" ON "channel" USING btree ("isArchived");--> statement-breakpoint
CREATE INDEX "IDX_0f58c11241e649d2a638a8de94" ON "channel" USING btree ("notesCount");--> statement-breakpoint
CREATE INDEX "IDX_094b86cd36bb805d1aa1e8cc9a" ON "channel" USING btree ("usersCount");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_BANNER_ID" ON "channel" USING btree ("bannerId");--> statement-breakpoint
CREATE INDEX "IDX_530257863e1381a7f2f1d3282f" ON "chat_approval" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_b1d46037f23d170da5c05fdf75" ON "chat_approval" USING btree ("otherId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_12c4768a2f706fc267f2078903" ON "chat_approval" USING btree ("userId","otherId");--> statement-breakpoint
CREATE INDEX "IDX_79a26e7a4d9afa5e4fc05f134e" ON "chat_message" USING btree ("fromUserId");--> statement-breakpoint
CREATE INDEX "IDX_25e097b51d7622c249452c6f75" ON "chat_message" USING btree ("toUserId");--> statement-breakpoint
CREATE INDEX "IDX_f006b8a76efd1abf9f221c175c" ON "chat_message" USING btree ("toRoomId");--> statement-breakpoint
CREATE INDEX "IDX_CHAT_MESSAGE_FILE_ID" ON "chat_message" USING btree ("fileId");--> statement-breakpoint
CREATE INDEX "IDX_8552bb38e7ed038c5bdd398a38" ON "chat_room_invitation" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_5f265075b215fc390a57523b12" ON "chat_room_invitation" USING btree ("roomId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_044f2a7962b8ee5bbfaa02e8a3" ON "chat_room_invitation" USING btree ("userId","roomId");--> statement-breakpoint
CREATE INDEX "IDX_d99c5279460fb77ef58c596ce5" ON "chat_room_membership" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_c25143ebab714e930aeca1c0e8" ON "chat_room_membership" USING btree ("roomId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_185b6b5afa707b5d36d1ce3144" ON "chat_room_membership" USING btree ("userId","roomId");--> statement-breakpoint
CREATE INDEX "IDX_f0d8ad64243fa2ca2800da0dfd" ON "chat_room" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "IDX_25a31662b0b0cc9af6549a9d71" ON "clip_favorite" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_CLIP_FAVORITE_CLIP_ID" ON "clip_favorite" USING btree ("clipId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_b1754a39d0b281e07ed7c078ec" ON "clip_favorite" USING btree ("userId","clipId");--> statement-breakpoint
CREATE INDEX "IDX_a012eaf5c87c65da1deb5fdbfa" ON "clip_note" USING btree ("noteId");--> statement-breakpoint
CREATE INDEX "IDX_ebe99317bbbe9968a0c6f579ad" ON "clip_note" USING btree ("clipId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_6fc0ec357d55a18646262fdfff" ON "clip_note" USING btree ("noteId","clipId");--> statement-breakpoint
CREATE INDEX "IDX_a3eac04ae2aa9e221e7596114a" ON "clip" USING btree ("lastClippedAt");--> statement-breakpoint
CREATE INDEX "IDX_2b5ec6c574d6802c94c80313fb" ON "clip" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_860fa6f6c7df5bb887249fba22" ON "drive_file" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_92779627994ac79277f070c91e" ON "drive_file" USING btree ("userHost");--> statement-breakpoint
CREATE INDEX "IDX_37bb9a1b4585f8a3beb24c62d6" ON "drive_file" USING btree ("md5");--> statement-breakpoint
CREATE INDEX "IDX_a40b8df8c989d7db937ea27cf6" ON "drive_file" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_d85a184c2540d2deba33daf642" ON "drive_file" USING btree ("accessKey");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_e74022ce9a074b3866f70e0d27" ON "drive_file" USING btree ("thumbnailAccessKey");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_c55b2b7c284d9fef98026fc88e" ON "drive_file" USING btree ("webpublicAccessKey");--> statement-breakpoint
CREATE INDEX "IDX_e5848eac4940934e23dbc17581" ON "drive_file" USING btree ("uri");--> statement-breakpoint
CREATE INDEX "IDX_bb90d1956dafc4068c28aa7560" ON "drive_file" USING btree ("folderId");--> statement-breakpoint
CREATE INDEX "IDX_a7eba67f8b3fa27271e85d2e26" ON "drive_file" USING btree ("isSensitive");--> statement-breakpoint
CREATE INDEX "IDX_3b33dff77bb64b23c88151d23e" ON "drive_file" USING btree ("maybeSensitive");--> statement-breakpoint
CREATE INDEX "IDX_8bdcd3dd2bddb78014999a16ce" ON "drive_file" USING btree ("maybePorn");--> statement-breakpoint
CREATE INDEX "IDX_315c779174fe8247ab324f036e" ON "drive_file" USING btree ("isLink");--> statement-breakpoint
CREATE INDEX "IDX_55720b33a61a7c806a8215b825" ON "drive_file" USING btree ("userId","folderId","id");--> statement-breakpoint
CREATE INDEX "IDX_f4fc06e49c0171c85f1c48060d" ON "drive_folder" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_00ceffb0cdc238b3233294f08f" ON "drive_folder" USING btree ("parentId");--> statement-breakpoint
CREATE INDEX "IDX_b37dafc86e9af007e3295c2781" ON "emoji" USING btree ("name");--> statement-breakpoint
CREATE INDEX "IDX_5900e907bb46516ddf2871327c" ON "emoji" USING btree ("host");--> statement-breakpoint
CREATE INDEX "IDX_EMOJI_CATEGORY" ON "emoji" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_4f4d35e1256c84ae3d1f0eab10" ON "emoji" USING btree ("name","host");--> statement-breakpoint
CREATE INDEX "IDX_EMOJI_ROLE_IDS" ON "emoji" USING gin ("roleIdsThatCanBeUsedThisEmojiAsReaction");--> statement-breakpoint
CREATE INDEX "IDX_60c4af1c19a7a75f1592f93b28" ON "flash_like" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_FLASH_LIKE_FLASH_ID" ON "flash_like" USING btree ("flashId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_cfbfeeccb0cbedcd660b17eb07" ON "flash_like" USING btree ("userId","flashId");--> statement-breakpoint
CREATE INDEX "IDX_3aa8ea9a8f15214ad91638c0a7" ON "flash" USING btree ("updatedAt");--> statement-breakpoint
CREATE INDEX "IDX_9b88250fc2fd009b8f1b5623ed" ON "flash" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_12c01c0d1a79f77d9f6c15fadd" ON "follow_request" USING btree ("followeeId");--> statement-breakpoint
CREATE INDEX "IDX_a7fd92dd6dc519e6fb435dd108" ON "follow_request" USING btree ("followerId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_d54a512b822fac7ed52800f6b4" ON "follow_request" USING btree ("followerId","followeeId");--> statement-breakpoint
CREATE INDEX "IDX_24e0042143a18157b234df186c" ON "following" USING btree ("followeeId");--> statement-breakpoint
CREATE INDEX "IDX_6516c5a6f3c015b4eed39978be" ON "following" USING btree ("followerId");--> statement-breakpoint
CREATE INDEX "IDX_5108098457488634a4768e1d12" ON "following" USING btree ("notify");--> statement-breakpoint
CREATE INDEX "IDX_4ccd2239268ebbd1b35e318754" ON "following" USING btree ("followerHost");--> statement-breakpoint
CREATE INDEX "IDX_fcdafee716dfe9c3b5fde90f30" ON "following" USING btree ("followeeHost");--> statement-breakpoint
CREATE INDEX "IDX_ce62b50d882d4e9dee10ad0d2f" ON "following" USING btree ("followeeId","followerHost","isFollowerHibernated");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_307be5f1d1252e0388662acb96" ON "following" USING btree ("followerId","followeeId");--> statement-breakpoint
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_ID_ID" ON "following" USING btree ("followeeId","id");--> statement-breakpoint
CREATE INDEX "IDX_FOLLOWING_FOLLOWER_ID_ID" ON "following" USING btree ("followerId","id");--> statement-breakpoint
CREATE INDEX "IDX_8fd5215095473061855ceb948c" ON "gallery_like" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_GALLERY_LIKE_POST_ID" ON "gallery_like" USING btree ("postId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_df1b5f4099e99fb0bc5eae53b6" ON "gallery_like" USING btree ("userId","postId");--> statement-breakpoint
CREATE INDEX "IDX_f631d37835adb04792e361807c" ON "gallery_post" USING btree ("updatedAt");--> statement-breakpoint
CREATE INDEX "IDX_985b836dddd8615e432d7043dd" ON "gallery_post" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_3ca50563facd913c425e7a89ee" ON "gallery_post" USING btree ("fileIds");--> statement-breakpoint
CREATE INDEX "IDX_f2d744d9a14d0dfb8b96cb7fc5" ON "gallery_post" USING btree ("isSensitive");--> statement-breakpoint
CREATE INDEX "IDX_1a165c68a49d08f11caffbd206" ON "gallery_post" USING btree ("likedCount");--> statement-breakpoint
CREATE INDEX "IDX_05cca34b985d1b8edc1d1e28df" ON "gallery_post" USING btree ("tags");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_347fec870eafea7b26c8a73bac" ON "hashtag" USING btree ("name");--> statement-breakpoint
CREATE INDEX "IDX_2710a55f826ee236ea1a62698f" ON "hashtag" USING btree ("mentionedUsersCount");--> statement-breakpoint
CREATE INDEX "IDX_0e206cec573f1edff4a3062923" ON "hashtag" USING btree ("mentionedLocalUsersCount");--> statement-breakpoint
CREATE INDEX "IDX_4c02d38a976c3ae132228c6fce" ON "hashtag" USING btree ("mentionedRemoteUsersCount");--> statement-breakpoint
CREATE INDEX "IDX_d57f9030cd3af7f63ffb1c267c" ON "hashtag" USING btree ("attachedUsersCount");--> statement-breakpoint
CREATE INDEX "IDX_0c44bf4f680964145f2a68a341" ON "hashtag" USING btree ("attachedLocalUsersCount");--> statement-breakpoint
CREATE INDEX "IDX_0b03cbcd7e6a7ce068efa8ecc2" ON "hashtag" USING btree ("attachedRemoteUsersCount");--> statement-breakpoint
CREATE INDEX "IDX_f7b9d338207e40e768e4a5265a" ON "instance" USING btree ("firstRetrievedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_8d5afc98982185799b160e10eb" ON "instance" USING btree ("host");--> statement-breakpoint
CREATE INDEX "IDX_3ede46f507c87ad698051d56a8" ON "instance" USING btree ("suspensionState");--> statement-breakpoint
CREATE INDEX "IDX_a08ad074601d204e0f69da9a95" ON "moderation_log" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_MODERATION_LOG_TYPE_ID" ON "moderation_log" USING btree ("type","id");--> statement-breakpoint
CREATE INDEX "IDX_MODERATION_LOG_USER_ID_ID" ON "moderation_log" USING btree ("userId","id");--> statement-breakpoint
CREATE INDEX "IDX_c1fd1c3dfb0627aa36c253fd14" ON "muting" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "IDX_ec96b4fed9dae517e0dbbe0675" ON "muting" USING btree ("muteeId");--> statement-breakpoint
CREATE INDEX "IDX_93060675b4a79a577f31d260c6" ON "muting" USING btree ("muterId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_1eb9d9824a630321a29fd3b290" ON "muting" USING btree ("muterId","muteeId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_DRAFT_REPLY_ID" ON "note_draft" USING btree ("replyId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_DRAFT_RENOTE_ID" ON "note_draft" USING btree ("renoteId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_DRAFT_USER_ID" ON "note_draft" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_DRAFT_CHANNEL_ID" ON "note_draft" USING btree ("channelId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_DRAFT_FILE_IDS" ON "note_draft" USING gin ("fileIds");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_DRAFT_VISIBLE_USER_IDS" ON "note_draft" USING gin ("visibleUserIds");--> statement-breakpoint
CREATE INDEX "IDX_47f4b1892f5d6ba8efb3057d81" ON "note_favorite" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_0e00498f180193423c992bc437" ON "note_favorite" USING btree ("noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_0f4fb9ad355f3effff221ef245" ON "note_favorite" USING btree ("userId","noteId");--> statement-breakpoint
CREATE INDEX "IDX_13761f64257f40c5636d0ff95e" ON "note_reaction" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_45145e4953780f3cd5656f0ea6" ON "note_reaction" USING btree ("noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_ad0c221b25672daf2df320a817" ON "note_reaction" USING btree ("userId","noteId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_REACTION_NOTE_ID_ID" ON "note_reaction" USING btree ("noteId","id");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_REACTION_USER_ID_ID" ON "note_reaction" USING btree ("userId","id");--> statement-breakpoint
CREATE INDEX "IDX_29c11c7deb06615076f8c95b80" ON "note_thread_muting" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_c426394644267453e76f036926" ON "note_thread_muting" USING btree ("threadId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_ae7aab18a2641d3e5f25e0c4ea" ON "note_thread_muting" USING btree ("userId","threadId");--> statement-breakpoint
CREATE INDEX "IDX_17cb3553c700a4985dff5a30ff" ON "note" USING btree ("replyId");--> statement-breakpoint
CREATE INDEX "IDX_52ccc804d7c69037d558bac4c9" ON "note" USING btree ("renoteId");--> statement-breakpoint
CREATE INDEX "IDX_d4ebdef929896d6dc4a3c5bb48" ON "note" USING btree ("threadId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_153536c67d05e9adb24e99fc2b" ON "note" USING btree ("uri");--> statement-breakpoint
CREATE INDEX "IDX_f22169eb10657bded6d875ac8f" ON "note" USING btree ("channelId");--> statement-breakpoint
CREATE INDEX "IDX_7125a826ab192eb27e11d358a5" ON "note" USING btree ("userHost");--> statement-breakpoint
CREATE INDEX "IDX_a6f649630f55af3888e5a42919" ON "note" USING btree ("userId","id");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_FILE_IDS" ON "note" USING gin ("fileIds") WITH (fastupdate=false);--> statement-breakpoint
CREATE INDEX "IDX_NOTE_VISIBLE_USER_IDS" ON "note" USING gin ("visibleUserIds") WITH (fastupdate=false);--> statement-breakpoint
CREATE INDEX "IDX_NOTE_MENTIONS" ON "note" USING gin ("mentions") WITH (fastupdate=false);--> statement-breakpoint
CREATE INDEX "IDX_NOTE_TAGS" ON "note" USING gin ("tags") WITH (fastupdate=false);--> statement-breakpoint
CREATE INDEX "IDX_0e61efab7f88dbb79c9166dbb4" ON "page_like" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_PAGE_LIKE_PAGE_ID" ON "page_like" USING btree ("pageId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_4ce6fb9c70529b4c8ac46c9bfa" ON "page_like" USING btree ("userId","pageId");--> statement-breakpoint
CREATE INDEX "IDX_af639b066dfbca78b01a920f8a" ON "page" USING btree ("updatedAt");--> statement-breakpoint
CREATE INDEX "IDX_b82c19c08afb292de4600d99e4" ON "page" USING btree ("name");--> statement-breakpoint
CREATE INDEX "IDX_ae1d917992dd0c9d9bbdad06c4" ON "page" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_90148bbc2bf0854428786bfc15" ON "page" USING btree ("visibleUserIds");--> statement-breakpoint
CREATE INDEX "IDX_PAGE_EYE_CATCHING_IMAGE_ID" ON "page" USING btree ("eyeCatchingImageId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_2133ef8317e4bdb839c0dcbf13" ON "page" USING btree ("userId","name");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_0b575fa9a4cfe638a925949285" ON "password_reset_request" USING btree ("token");--> statement-breakpoint
CREATE INDEX "IDX_4bb7fd4a34492ae0e6cc8d30ac" ON "password_reset_request" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_66d2bd2ee31d14bcc23069a89f" ON "poll_vote" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_aecfbd5ef60374918e63ee95fa" ON "poll_vote" USING btree ("noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_50bd7164c5b78f1f4a42c4d21f" ON "poll_vote" USING btree ("userId","noteId","choice");--> statement-breakpoint
CREATE INDEX "IDX_0610ebcfcfb4a18441a9bcdab2" ON "poll" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_7fa20a12319c7f6dc3aed98c0a" ON "poll" USING btree ("userHost");--> statement-breakpoint
CREATE INDEX "IDX_c1240fcc9675946ea5d6c2860e" ON "poll" USING btree ("channelId");--> statement-breakpoint
CREATE INDEX "IDX_83f0862e9bae44af52ced7099e" ON "promo_note" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_9657d55550c3d37bfafaf7d4b0" ON "promo_read" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_PROMO_READ_NOTE_ID" ON "promo_read" USING btree ("noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_2882b8a1a07c7d281a98b6db16" ON "promo_read" USING btree ("userId","noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_0ff69e8dfa9fe31bb4a4660f59" ON "registration_ticket" USING btree ("code");--> statement-breakpoint
CREATE INDEX "IDX_beba993576db0261a15364ea96" ON "registration_ticket" USING btree ("createdById");--> statement-breakpoint
CREATE INDEX "IDX_b6f93f2f30bdbb9a5ebdc7c718" ON "registration_ticket" USING btree ("usedById");--> statement-breakpoint
CREATE UNIQUE INDEX "REL_b6f93f2f30bdbb9a5ebdc7c718" ON "registration_ticket" USING btree ("usedById");--> statement-breakpoint
CREATE INDEX "IDX_fb9d21ba0abb83223263df6bcb" ON "registry_item" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_22baca135bb8a3ea1a83d13df3" ON "registry_item" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "IDX_0a72bdfcdb97c0eca11fe7ecad" ON "registry_item" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_0d9a1738f2cf7f3b1c3334dfab" ON "relay" USING btree ("inbox");--> statement-breakpoint
CREATE INDEX "IDX_relay_status" ON "relay" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_7eac97594bcac5ffcf2068089b" ON "renote_muting" USING btree ("muteeId");--> statement-breakpoint
CREATE INDEX "IDX_7aa72a5fe76019bfe8e5e0e8b7" ON "renote_muting" USING btree ("muterId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_0d801c609cec4e9eb4b6b4490c" ON "renote_muting" USING btree ("muterId","muteeId");--> statement-breakpoint
CREATE INDEX "IDX_09f4e5b9e4a2f268d3e284e4b3" ON "retention_aggregation" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_f7c3576b37bd2eec966ae24477" ON "retention_aggregation" USING btree ("dateKey");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_0953deda7ce6e1448e935859e5" ON "role_assignment" USING btree ("userId","roleId");--> statement-breakpoint
CREATE INDEX "IDX_db5b72c16227c97ca88734d5c2" ON "role_assignment" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_f0de67fd09cd3cd0aabca79994" ON "role_assignment" USING btree ("roleId");--> statement-breakpoint
CREATE INDEX "IDX_539b6c08c05067599743bb6389" ON "role_assignment" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "IDX_2c308dbdc50d94dc625670055f" ON "signin" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_SIGNIN_USER_ID_ID" ON "signin" USING btree ("userId","id");--> statement-breakpoint
CREATE INDEX "IDX_SW_SUBSCRIPTION_ENDPOINT" ON "sw_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_SW_SUBSCRIPTION_USER_ID_ENDPOINT_UNIQUE" ON "sw_subscription" USING btree ("userId","endpoint");--> statement-breakpoint
CREATE INDEX "IDX_41a3c87a37aea616ee459369e1" ON "system_account" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_c362033aee0ea51011386a5a7e" ON "system_account" USING btree ("type");--> statement-breakpoint
CREATE INDEX "IDX_system_webhook_isActive" ON "system_webhook" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "IDX_system_webhook_on" ON "system_webhook" USING gin ("on");--> statement-breakpoint
CREATE INDEX "IDX_7f7f1c66f48e9a8e18a33bc515" ON "user_ip" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_361b500e06721013c124b7b6c5" ON "user_ip" USING btree ("userId","ip");--> statement-breakpoint
CREATE INDEX "IDX_016f613dc4feb807e03e3e7da9" ON "user_list_favorite" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_USER_LIST_FAVORITE_USER_LIST_ID" ON "user_list_favorite" USING btree ("userListId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_d6765a8c2a4c17c33f9d7f948b" ON "user_list_favorite" USING btree ("userId","userListId");--> statement-breakpoint
CREATE INDEX "IDX_021015e6683570ae9f6b0c62be" ON "user_list_membership" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_cddcaf418dc4d392ecfcca842a" ON "user_list_membership" USING btree ("userListId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_e4f3094c43f2d665e6030b0337" ON "user_list_membership" USING btree ("userId","userListId");--> statement-breakpoint
CREATE INDEX "IDX_b7fcefbdd1c18dce86687531f9" ON "user_list" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_48a00f08598662b9ca540521eb" ON "user_list" USING btree ("isPublic");--> statement-breakpoint
CREATE INDEX "IDX_650b49c5639b5840ee6a2b8f83" ON "user_memo" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_66ac4a82894297fd09ba61f3d3" ON "user_memo" USING btree ("targetUserId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_faef300913c738265638ba3ebc" ON "user_memo" USING btree ("userId","targetUserId");--> statement-breakpoint
CREATE INDEX "IDX_bfbc6f79ba4007b4ce5097f08d" ON "user_note_pining" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_68881008f7c3588ad7ecae471c" ON "user_note_pining" USING btree ("noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_410cd649884b501c02d6e72738" ON "user_note_pining" USING btree ("userId","noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_4e5c4c99175638ec0761714ab0" ON "user_pending" USING btree ("code");--> statement-breakpoint
CREATE INDEX "IDX_3befe6f999c86aff06eb0257b4" ON "user_profile" USING btree ("enableWordMute");--> statement-breakpoint
CREATE INDEX "IDX_dce530b98e454793dac5ec2f5a" ON "user_profile" USING btree ("userHost");--> statement-breakpoint
CREATE UNIQUE INDEX "REL_6dc44f1ceb65b1e72bacef2ca2" ON "user_profile" USING btree ("pinnedPageId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_171e64971c780ebd23fae140bb" ON "user_publickey" USING btree ("keyId");--> statement-breakpoint
CREATE INDEX "IDX_ff9ca3b5f3ee3d0681367a9b44" ON "user_security_key" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_0d7718e562dcedd0aa5cf2c9f7" ON "user_security_key" USING btree ("publicKey");--> statement-breakpoint
CREATE INDEX "IDX_USER_FOLLOWERS_COUNT" ON "user" USING btree ("followersCount");--> statement-breakpoint
CREATE INDEX "IDX_80ca6e6ef65fb9ef34ea8c90f4" ON "user" USING btree ("updatedAt");--> statement-breakpoint
CREATE INDEX "IDX_c8cc87bd0f2f4487d17c651fbf" ON "user" USING btree ("lastActiveDate");--> statement-breakpoint
CREATE INDEX "IDX_a27b942a0d6dcff90e3ee9b5e8" ON "user" USING btree ("usernameLower");--> statement-breakpoint
CREATE INDEX "IDX_fa99d777623947a5b05f394cae" ON "user" USING btree ("tags");--> statement-breakpoint
CREATE INDEX "IDX_d5a1b83c7cab66f167e6888188" ON "user" USING btree ("isExplorable");--> statement-breakpoint
CREATE INDEX "IDX_3252a5df8d5bbd16b281f7799e" ON "user" USING btree ("host");--> statement-breakpoint
CREATE INDEX "IDX_be623adaa4c566baf5d29ce0c8" ON "user" USING btree ("uri");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_a854e557b1b14814750c7c7b0c" ON "user" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_5deb01ae162d1d70b80d064c27" ON "user" USING btree ("usernameLower","host");--> statement-breakpoint
CREATE UNIQUE INDEX "REL_58f5c71eaab331645112cf8cfa" ON "user" USING btree ("avatarId");--> statement-breakpoint
CREATE UNIQUE INDEX "REL_afc64b53f8db3707ceb34eb28e" ON "user" USING btree ("bannerId");--> statement-breakpoint
CREATE INDEX "IDX_f272c8c8805969e6a6449c77b3" ON "webhook" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_8063a0586ed1dfbe86e982d961" ON "webhook" USING btree ("on");--> statement-breakpoint
CREATE INDEX "IDX_5a056076f76b2efe08216ba655" ON "webhook" USING btree ("active");