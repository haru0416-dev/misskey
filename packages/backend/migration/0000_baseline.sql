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
CREATE INDEX "IDX_ABUSE_USER_REPORT_TARGET_USER_ID" ON "abuse_user_report" USING btree ("targetUserId");--> statement-breakpoint
CREATE INDEX "IDX_ABUSE_USER_REPORT_REPORTER_ID" ON "abuse_user_report" USING btree ("reporterId");--> statement-breakpoint
CREATE INDEX "IDX_ABUSE_USER_REPORT_RESOLVED" ON "abuse_user_report" USING btree ("resolved");--> statement-breakpoint
CREATE INDEX "IDX_ABUSE_USER_REPORT_TARGET_USER_HOST" ON "abuse_user_report" USING btree ("targetUserHost");--> statement-breakpoint
CREATE INDEX "IDX_ABUSE_USER_REPORT_REPORTER_HOST" ON "abuse_user_report" USING btree ("reporterHost");--> statement-breakpoint
CREATE INDEX "IDX_ABUSE_USER_REPORT_RESOLVED_ID" ON "abuse_user_report" USING btree ("resolved","id");--> statement-breakpoint
CREATE INDEX "IDX_ABUSE_USER_REPORT_TARGET_HOST_ID" ON "abuse_user_report" USING btree ("targetUserHost","id");--> statement-breakpoint
CREATE INDEX "IDX_ABUSE_USER_REPORT_REPORTER_HOST_ID" ON "abuse_user_report" USING btree ("reporterHost","id");--> statement-breakpoint
CREATE INDEX "IDX_ABUSE_USER_REPORT_ASSIGNEE_ID" ON "abuse_user_report" USING btree ("assigneeId");--> statement-breakpoint
CREATE INDEX "IDX_ACCESS_TOKEN_TOKEN" ON "access_token" USING btree ("token");--> statement-breakpoint
CREATE INDEX "IDX_ACCESS_TOKEN_SESSION" ON "access_token" USING btree ("session");--> statement-breakpoint
CREATE INDEX "IDX_ACCESS_TOKEN_HASH" ON "access_token" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "IDX_ACCESS_TOKEN_USER_ID" ON "access_token" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_ACCESS_TOKEN_APP_ID" ON "access_token" USING btree ("appId");--> statement-breakpoint
CREATE INDEX "IDX_AD_EXPIRES_AT" ON "ad" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "IDX_AD_STARTS_AT" ON "ad" USING btree ("startsAt");--> statement-breakpoint
CREATE INDEX "IDX_ANNOUNCEMENT_READ_USER_ID" ON "announcement_read" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_ANNOUNCEMENT_READ_ANNOUNCEMENT_ID" ON "announcement_read" USING btree ("announcementId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_ANNOUNCEMENT_READ_USER_ID_ANNOUNCEMENT_ID_UNIQUE" ON "announcement_read" USING btree ("userId","announcementId");--> statement-breakpoint
CREATE INDEX "IDX_ANNOUNCEMENT_IS_ACTIVE" ON "announcement" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "IDX_ANNOUNCEMENT_FOR_EXISTING_USERS" ON "announcement" USING btree ("forExistingUsers");--> statement-breakpoint
CREATE INDEX "IDX_ANNOUNCEMENT_SILENCE" ON "announcement" USING btree ("silence");--> statement-breakpoint
CREATE INDEX "IDX_ANNOUNCEMENT_USER_ID" ON "announcement" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_ANTENNA_LAST_USED_AT" ON "antenna" USING btree ("lastUsedAt");--> statement-breakpoint
CREATE INDEX "IDX_ANTENNA_USER_ID" ON "antenna" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_ANTENNA_IS_ACTIVE" ON "antenna" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "IDX_ANTENNA_USER_LIST_ID" ON "antenna" USING btree ("userListId");--> statement-breakpoint
CREATE INDEX "IDX_APP_USER_ID" ON "app" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_APP_SECRET" ON "app" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "IDX_AUTH_SESSION_TOKEN" ON "auth_session" USING btree ("token");--> statement-breakpoint
CREATE INDEX "IDX_AUTH_SESSION_USER_ID" ON "auth_session" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_AUTH_SESSION_APP_ID" ON "auth_session" USING btree ("appId");--> statement-breakpoint
CREATE INDEX "IDX_BLOCKING_BLOCKEE_ID" ON "blocking" USING btree ("blockeeId");--> statement-breakpoint
CREATE INDEX "IDX_BLOCKING_BLOCKER_ID" ON "blocking" USING btree ("blockerId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_BLOCKING_BLOCKER_ID_BLOCKEE_ID_UNIQUE" ON "blocking" USING btree ("blockerId","blockeeId");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_FAVORITE_CHANNEL_ID" ON "channel_favorite" USING btree ("channelId");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_FAVORITE_USER_ID" ON "channel_favorite" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_CHANNEL_FAVORITE_USER_ID_CHANNEL_ID_UNIQUE" ON "channel_favorite" USING btree ("userId","channelId");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_FOLLOWING_FOLLOWEE_ID" ON "channel_following" USING btree ("followeeId");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_FOLLOWING_FOLLOWER_ID" ON "channel_following" USING btree ("followerId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_CHANNEL_FOLLOWING_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE" ON "channel_following" USING btree ("followerId","followeeId");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_MUTING_USER_ID" ON "channel_muting" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_MUTING_CHANNEL_ID" ON "channel_muting" USING btree ("channelId");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_MUTING_EXPIRES_AT" ON "channel_muting" USING btree ("expiresAt");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_CHANNEL_MUTING_USER_ID_CHANNEL_ID_UNIQUE" ON "channel_muting" USING btree ("userId","channelId");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_LAST_NOTED_AT" ON "channel" USING btree ("lastNotedAt");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_USER_ID" ON "channel" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_IS_ARCHIVED" ON "channel" USING btree ("isArchived");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_NOTES_COUNT" ON "channel" USING btree ("notesCount");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_USERS_COUNT" ON "channel" USING btree ("usersCount");--> statement-breakpoint
CREATE INDEX "IDX_CHANNEL_BANNER_ID" ON "channel" USING btree ("bannerId");--> statement-breakpoint
CREATE INDEX "IDX_CHAT_APPROVAL_USER_ID" ON "chat_approval" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_CHAT_APPROVAL_OTHER_ID" ON "chat_approval" USING btree ("otherId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_CHAT_APPROVAL_USER_ID_OTHER_ID_UNIQUE" ON "chat_approval" USING btree ("userId","otherId");--> statement-breakpoint
CREATE INDEX "IDX_CHAT_MESSAGE_FROM_USER_ID" ON "chat_message" USING btree ("fromUserId");--> statement-breakpoint
CREATE INDEX "IDX_CHAT_MESSAGE_TO_USER_ID" ON "chat_message" USING btree ("toUserId");--> statement-breakpoint
CREATE INDEX "IDX_CHAT_MESSAGE_TO_ROOM_ID" ON "chat_message" USING btree ("toRoomId");--> statement-breakpoint
CREATE INDEX "IDX_CHAT_MESSAGE_FILE_ID" ON "chat_message" USING btree ("fileId");--> statement-breakpoint
CREATE INDEX "IDX_CHAT_ROOM_INVITATION_USER_ID" ON "chat_room_invitation" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_CHAT_ROOM_INVITATION_ROOM_ID" ON "chat_room_invitation" USING btree ("roomId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_CHAT_ROOM_INVITATION_USER_ID_ROOM_ID_UNIQUE" ON "chat_room_invitation" USING btree ("userId","roomId");--> statement-breakpoint
CREATE INDEX "IDX_CHAT_ROOM_MEMBERSHIP_USER_ID" ON "chat_room_membership" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_CHAT_ROOM_MEMBERSHIP_ROOM_ID" ON "chat_room_membership" USING btree ("roomId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_CHAT_ROOM_MEMBERSHIP_USER_ID_ROOM_ID_UNIQUE" ON "chat_room_membership" USING btree ("userId","roomId");--> statement-breakpoint
CREATE INDEX "IDX_CHAT_ROOM_OWNER_ID" ON "chat_room" USING btree ("ownerId");--> statement-breakpoint
CREATE INDEX "IDX_CLIP_FAVORITE_USER_ID" ON "clip_favorite" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_CLIP_FAVORITE_CLIP_ID" ON "clip_favorite" USING btree ("clipId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_CLIP_FAVORITE_USER_ID_CLIP_ID_UNIQUE" ON "clip_favorite" USING btree ("userId","clipId");--> statement-breakpoint
CREATE INDEX "IDX_CLIP_NOTE_NOTE_ID" ON "clip_note" USING btree ("noteId");--> statement-breakpoint
CREATE INDEX "IDX_CLIP_NOTE_CLIP_ID" ON "clip_note" USING btree ("clipId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_CLIP_NOTE_NOTE_ID_CLIP_ID_UNIQUE" ON "clip_note" USING btree ("noteId","clipId");--> statement-breakpoint
CREATE INDEX "IDX_CLIP_LAST_CLIPPED_AT" ON "clip" USING btree ("lastClippedAt");--> statement-breakpoint
CREATE INDEX "IDX_CLIP_USER_ID" ON "clip" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FILE_USER_ID" ON "drive_file" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FILE_USER_HOST" ON "drive_file" USING btree ("userHost");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FILE_MD5" ON "drive_file" USING btree ("md5");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FILE_TYPE" ON "drive_file" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_DRIVE_FILE_ACCESS_KEY_UNIQUE" ON "drive_file" USING btree ("accessKey");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_DRIVE_FILE_THUMBNAIL_ACCESS_KEY_UNIQUE" ON "drive_file" USING btree ("thumbnailAccessKey");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_DRIVE_FILE_WEBPUBLIC_ACCESS_KEY_UNIQUE" ON "drive_file" USING btree ("webpublicAccessKey");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FILE_URI" ON "drive_file" USING btree ("uri");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FILE_FOLDER_ID" ON "drive_file" USING btree ("folderId");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FILE_IS_SENSITIVE" ON "drive_file" USING btree ("isSensitive");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FILE_MAYBE_SENSITIVE" ON "drive_file" USING btree ("maybeSensitive");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FILE_MAYBE_PORN" ON "drive_file" USING btree ("maybePorn");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FILE_IS_LINK" ON "drive_file" USING btree ("isLink");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FILE_USER_ID_FOLDER_ID_ID" ON "drive_file" USING btree ("userId","folderId","id");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FOLDER_USER_ID" ON "drive_folder" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_DRIVE_FOLDER_PARENT_ID" ON "drive_folder" USING btree ("parentId");--> statement-breakpoint
CREATE INDEX "IDX_EMOJI_NAME" ON "emoji" USING btree ("name");--> statement-breakpoint
CREATE INDEX "IDX_EMOJI_HOST" ON "emoji" USING btree ("host");--> statement-breakpoint
CREATE INDEX "IDX_EMOJI_CATEGORY" ON "emoji" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_EMOJI_NAME_HOST_UNIQUE" ON "emoji" USING btree ("name","host");--> statement-breakpoint
CREATE INDEX "IDX_EMOJI_ROLE_IDS" ON "emoji" USING gin ("roleIdsThatCanBeUsedThisEmojiAsReaction");--> statement-breakpoint
CREATE INDEX "IDX_FLASH_LIKE_USER_ID" ON "flash_like" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_FLASH_LIKE_FLASH_ID" ON "flash_like" USING btree ("flashId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_FLASH_LIKE_USER_ID_FLASH_ID_UNIQUE" ON "flash_like" USING btree ("userId","flashId");--> statement-breakpoint
CREATE INDEX "IDX_FLASH_UPDATED_AT" ON "flash" USING btree ("updatedAt");--> statement-breakpoint
CREATE INDEX "IDX_FLASH_USER_ID" ON "flash" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_FOLLOW_REQUEST_FOLLOWEE_ID" ON "follow_request" USING btree ("followeeId");--> statement-breakpoint
CREATE INDEX "IDX_FOLLOW_REQUEST_FOLLOWER_ID" ON "follow_request" USING btree ("followerId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_FOLLOW_REQUEST_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE" ON "follow_request" USING btree ("followerId","followeeId");--> statement-breakpoint
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_ID" ON "following" USING btree ("followeeId");--> statement-breakpoint
CREATE INDEX "IDX_FOLLOWING_FOLLOWER_ID" ON "following" USING btree ("followerId");--> statement-breakpoint
CREATE INDEX "IDX_FOLLOWING_NOTIFY" ON "following" USING btree ("notify");--> statement-breakpoint
CREATE INDEX "IDX_FOLLOWING_FOLLOWER_HOST" ON "following" USING btree ("followerHost");--> statement-breakpoint
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_HOST" ON "following" USING btree ("followeeHost");--> statement-breakpoint
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_ID_FOLLOWER_HOST_IS_FOLLOWER_HIBERNATED" ON "following" USING btree ("followeeId","followerHost","isFollowerHibernated");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_FOLLOWING_FOLLOWER_ID_FOLLOWEE_ID_UNIQUE" ON "following" USING btree ("followerId","followeeId");--> statement-breakpoint
CREATE INDEX "IDX_FOLLOWING_FOLLOWEE_ID_ID" ON "following" USING btree ("followeeId","id");--> statement-breakpoint
CREATE INDEX "IDX_FOLLOWING_FOLLOWER_ID_ID" ON "following" USING btree ("followerId","id");--> statement-breakpoint
CREATE INDEX "IDX_GALLERY_LIKE_USER_ID" ON "gallery_like" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_GALLERY_LIKE_POST_ID" ON "gallery_like" USING btree ("postId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_GALLERY_LIKE_USER_ID_POST_ID_UNIQUE" ON "gallery_like" USING btree ("userId","postId");--> statement-breakpoint
CREATE INDEX "IDX_GALLERY_POST_UPDATED_AT" ON "gallery_post" USING btree ("updatedAt");--> statement-breakpoint
CREATE INDEX "IDX_GALLERY_POST_USER_ID" ON "gallery_post" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_GALLERY_POST_FILE_IDS" ON "gallery_post" USING btree ("fileIds");--> statement-breakpoint
CREATE INDEX "IDX_GALLERY_POST_IS_SENSITIVE" ON "gallery_post" USING btree ("isSensitive");--> statement-breakpoint
CREATE INDEX "IDX_GALLERY_POST_LIKED_COUNT" ON "gallery_post" USING btree ("likedCount");--> statement-breakpoint
CREATE INDEX "IDX_GALLERY_POST_TAGS" ON "gallery_post" USING btree ("tags");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_HASHTAG_NAME_UNIQUE" ON "hashtag" USING btree ("name");--> statement-breakpoint
CREATE INDEX "IDX_HASHTAG_MENTIONED_USERS_COUNT" ON "hashtag" USING btree ("mentionedUsersCount");--> statement-breakpoint
CREATE INDEX "IDX_HASHTAG_MENTIONED_LOCAL_USERS_COUNT" ON "hashtag" USING btree ("mentionedLocalUsersCount");--> statement-breakpoint
CREATE INDEX "IDX_HASHTAG_MENTIONED_REMOTE_USERS_COUNT" ON "hashtag" USING btree ("mentionedRemoteUsersCount");--> statement-breakpoint
CREATE INDEX "IDX_HASHTAG_ATTACHED_USERS_COUNT" ON "hashtag" USING btree ("attachedUsersCount");--> statement-breakpoint
CREATE INDEX "IDX_HASHTAG_ATTACHED_LOCAL_USERS_COUNT" ON "hashtag" USING btree ("attachedLocalUsersCount");--> statement-breakpoint
CREATE INDEX "IDX_HASHTAG_ATTACHED_REMOTE_USERS_COUNT" ON "hashtag" USING btree ("attachedRemoteUsersCount");--> statement-breakpoint
CREATE INDEX "IDX_INSTANCE_FIRST_RETRIEVED_AT" ON "instance" USING btree ("firstRetrievedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_INSTANCE_HOST_UNIQUE" ON "instance" USING btree ("host");--> statement-breakpoint
CREATE INDEX "IDX_INSTANCE_SUSPENSION_STATE" ON "instance" USING btree ("suspensionState");--> statement-breakpoint
CREATE INDEX "IDX_MODERATION_LOG_USER_ID" ON "moderation_log" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_MODERATION_LOG_TYPE_ID" ON "moderation_log" USING btree ("type","id");--> statement-breakpoint
CREATE INDEX "IDX_MODERATION_LOG_USER_ID_ID" ON "moderation_log" USING btree ("userId","id");--> statement-breakpoint
CREATE INDEX "IDX_MUTING_EXPIRES_AT" ON "muting" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "IDX_MUTING_MUTEE_ID" ON "muting" USING btree ("muteeId");--> statement-breakpoint
CREATE INDEX "IDX_MUTING_MUTER_ID" ON "muting" USING btree ("muterId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_MUTING_MUTER_ID_MUTEE_ID_UNIQUE" ON "muting" USING btree ("muterId","muteeId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_DRAFT_REPLY_ID" ON "note_draft" USING btree ("replyId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_DRAFT_RENOTE_ID" ON "note_draft" USING btree ("renoteId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_DRAFT_USER_ID" ON "note_draft" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_DRAFT_CHANNEL_ID" ON "note_draft" USING btree ("channelId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_DRAFT_FILE_IDS" ON "note_draft" USING gin ("fileIds");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_DRAFT_VISIBLE_USER_IDS" ON "note_draft" USING gin ("visibleUserIds");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_FAVORITE_USER_ID" ON "note_favorite" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_FAVORITE_NOTE_ID" ON "note_favorite" USING btree ("noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_NOTE_FAVORITE_USER_ID_NOTE_ID_UNIQUE" ON "note_favorite" USING btree ("userId","noteId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_REACTION_USER_ID" ON "note_reaction" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_REACTION_NOTE_ID" ON "note_reaction" USING btree ("noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_NOTE_REACTION_USER_ID_NOTE_ID_UNIQUE" ON "note_reaction" USING btree ("userId","noteId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_REACTION_NOTE_ID_ID" ON "note_reaction" USING btree ("noteId","id");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_REACTION_USER_ID_ID" ON "note_reaction" USING btree ("userId","id");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_THREAD_MUTING_USER_ID" ON "note_thread_muting" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_THREAD_MUTING_THREAD_ID" ON "note_thread_muting" USING btree ("threadId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_NOTE_THREAD_MUTING_USER_ID_THREAD_ID_UNIQUE" ON "note_thread_muting" USING btree ("userId","threadId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_REPLY_ID" ON "note" USING btree ("replyId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_RENOTE_ID" ON "note" USING btree ("renoteId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_THREAD_ID" ON "note" USING btree ("threadId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_NOTE_URI_UNIQUE" ON "note" USING btree ("uri");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_CHANNEL_ID" ON "note" USING btree ("channelId");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_USER_HOST" ON "note" USING btree ("userHost");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_USER_ID_ID" ON "note" USING btree ("userId","id");--> statement-breakpoint
CREATE INDEX "IDX_NOTE_FILE_IDS" ON "note" USING gin ("fileIds") WITH (fastupdate=false);--> statement-breakpoint
CREATE INDEX "IDX_NOTE_VISIBLE_USER_IDS" ON "note" USING gin ("visibleUserIds") WITH (fastupdate=false);--> statement-breakpoint
CREATE INDEX "IDX_NOTE_MENTIONS" ON "note" USING gin ("mentions") WITH (fastupdate=false);--> statement-breakpoint
CREATE INDEX "IDX_NOTE_TAGS" ON "note" USING gin ("tags") WITH (fastupdate=false);--> statement-breakpoint
CREATE INDEX "IDX_PAGE_LIKE_USER_ID" ON "page_like" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_PAGE_LIKE_PAGE_ID" ON "page_like" USING btree ("pageId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_PAGE_LIKE_USER_ID_PAGE_ID_UNIQUE" ON "page_like" USING btree ("userId","pageId");--> statement-breakpoint
CREATE INDEX "IDX_PAGE_UPDATED_AT" ON "page" USING btree ("updatedAt");--> statement-breakpoint
CREATE INDEX "IDX_PAGE_NAME" ON "page" USING btree ("name");--> statement-breakpoint
CREATE INDEX "IDX_PAGE_USER_ID" ON "page" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_PAGE_VISIBLE_USER_IDS" ON "page" USING btree ("visibleUserIds");--> statement-breakpoint
CREATE INDEX "IDX_PAGE_EYE_CATCHING_IMAGE_ID" ON "page" USING btree ("eyeCatchingImageId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_PAGE_USER_ID_NAME_UNIQUE" ON "page" USING btree ("userId","name");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_PASSWORD_RESET_REQUEST_TOKEN_UNIQUE" ON "password_reset_request" USING btree ("token");--> statement-breakpoint
CREATE INDEX "IDX_PASSWORD_RESET_REQUEST_USER_ID" ON "password_reset_request" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_POLL_VOTE_USER_ID" ON "poll_vote" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_POLL_VOTE_NOTE_ID" ON "poll_vote" USING btree ("noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_POLL_VOTE_USER_ID_NOTE_ID_CHOICE_UNIQUE" ON "poll_vote" USING btree ("userId","noteId","choice");--> statement-breakpoint
CREATE INDEX "IDX_POLL_USER_ID" ON "poll" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_POLL_USER_HOST" ON "poll" USING btree ("userHost");--> statement-breakpoint
CREATE INDEX "IDX_POLL_CHANNEL_ID" ON "poll" USING btree ("channelId");--> statement-breakpoint
CREATE INDEX "IDX_PROMO_NOTE_USER_ID" ON "promo_note" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_PROMO_READ_USER_ID" ON "promo_read" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_PROMO_READ_NOTE_ID" ON "promo_read" USING btree ("noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_PROMO_READ_USER_ID_NOTE_ID_UNIQUE" ON "promo_read" USING btree ("userId","noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_REGISTRATION_TICKET_CODE_UNIQUE" ON "registration_ticket" USING btree ("code");--> statement-breakpoint
CREATE INDEX "IDX_REGISTRATION_TICKET_CREATED_BY_ID" ON "registration_ticket" USING btree ("createdById");--> statement-breakpoint
CREATE INDEX "IDX_REGISTRATION_TICKET_USED_BY_ID" ON "registration_ticket" USING btree ("usedById");--> statement-breakpoint
CREATE UNIQUE INDEX "REL_b6f93f2f30bdbb9a5ebdc7c718" ON "registration_ticket" USING btree ("usedById");--> statement-breakpoint
CREATE INDEX "IDX_REGISTRY_ITEM_USER_ID" ON "registry_item" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_REGISTRY_ITEM_SCOPE" ON "registry_item" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "IDX_REGISTRY_ITEM_DOMAIN" ON "registry_item" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_RELAY_INBOX_UNIQUE" ON "relay" USING btree ("inbox");--> statement-breakpoint
CREATE INDEX "IDX_relay_status" ON "relay" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_RENOTE_MUTING_MUTEE_ID" ON "renote_muting" USING btree ("muteeId");--> statement-breakpoint
CREATE INDEX "IDX_RENOTE_MUTING_MUTER_ID" ON "renote_muting" USING btree ("muterId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_RENOTE_MUTING_MUTER_ID_MUTEE_ID_UNIQUE" ON "renote_muting" USING btree ("muterId","muteeId");--> statement-breakpoint
CREATE INDEX "IDX_RETENTION_AGGREGATION_CREATED_AT" ON "retention_aggregation" USING btree ("createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_RETENTION_AGGREGATION_DATE_KEY_UNIQUE" ON "retention_aggregation" USING btree ("dateKey");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_ROLE_ASSIGNMENT_USER_ID_ROLE_ID_UNIQUE" ON "role_assignment" USING btree ("userId","roleId");--> statement-breakpoint
CREATE INDEX "IDX_ROLE_ASSIGNMENT_USER_ID" ON "role_assignment" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_ROLE_ASSIGNMENT_ROLE_ID" ON "role_assignment" USING btree ("roleId");--> statement-breakpoint
CREATE INDEX "IDX_ROLE_ASSIGNMENT_EXPIRES_AT" ON "role_assignment" USING btree ("expiresAt");--> statement-breakpoint
CREATE INDEX "IDX_SIGNIN_USER_ID" ON "signin" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_SIGNIN_USER_ID_ID" ON "signin" USING btree ("userId","id");--> statement-breakpoint
CREATE INDEX "IDX_SW_SUBSCRIPTION_ENDPOINT" ON "sw_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_SW_SUBSCRIPTION_USER_ID_ENDPOINT_UNIQUE" ON "sw_subscription" USING btree ("userId","endpoint");--> statement-breakpoint
CREATE INDEX "IDX_SYSTEM_ACCOUNT_USER_ID" ON "system_account" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_SYSTEM_ACCOUNT_TYPE_UNIQUE" ON "system_account" USING btree ("type");--> statement-breakpoint
CREATE INDEX "IDX_system_webhook_isActive" ON "system_webhook" USING btree ("isActive");--> statement-breakpoint
CREATE INDEX "IDX_system_webhook_on" ON "system_webhook" USING gin ("on");--> statement-breakpoint
CREATE INDEX "IDX_USER_IP_USER_ID" ON "user_ip" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_USER_IP_USER_ID_IP_UNIQUE" ON "user_ip" USING btree ("userId","ip");--> statement-breakpoint
CREATE INDEX "IDX_USER_LIST_FAVORITE_USER_ID" ON "user_list_favorite" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_USER_LIST_FAVORITE_USER_LIST_ID" ON "user_list_favorite" USING btree ("userListId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_USER_LIST_FAVORITE_USER_ID_USER_LIST_ID_UNIQUE" ON "user_list_favorite" USING btree ("userId","userListId");--> statement-breakpoint
CREATE INDEX "IDX_USER_LIST_MEMBERSHIP_USER_ID" ON "user_list_membership" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_USER_LIST_MEMBERSHIP_USER_LIST_ID" ON "user_list_membership" USING btree ("userListId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_USER_LIST_MEMBERSHIP_USER_ID_USER_LIST_ID_UNIQUE" ON "user_list_membership" USING btree ("userId","userListId");--> statement-breakpoint
CREATE INDEX "IDX_USER_LIST_USER_ID" ON "user_list" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_USER_LIST_IS_PUBLIC" ON "user_list" USING btree ("isPublic");--> statement-breakpoint
CREATE INDEX "IDX_USER_MEMO_USER_ID" ON "user_memo" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_USER_MEMO_TARGET_USER_ID" ON "user_memo" USING btree ("targetUserId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_USER_MEMO_USER_ID_TARGET_USER_ID_UNIQUE" ON "user_memo" USING btree ("userId","targetUserId");--> statement-breakpoint
CREATE INDEX "IDX_USER_NOTE_PINING_USER_ID" ON "user_note_pining" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_USER_NOTE_PINING_NOTE_ID" ON "user_note_pining" USING btree ("noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_USER_NOTE_PINING_USER_ID_NOTE_ID_UNIQUE" ON "user_note_pining" USING btree ("userId","noteId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_USER_PENDING_CODE_UNIQUE" ON "user_pending" USING btree ("code");--> statement-breakpoint
CREATE INDEX "IDX_USER_PROFILE_ENABLE_WORD_MUTE" ON "user_profile" USING btree ("enableWordMute");--> statement-breakpoint
CREATE INDEX "IDX_USER_PROFILE_USER_HOST" ON "user_profile" USING btree ("userHost");--> statement-breakpoint
CREATE UNIQUE INDEX "REL_6dc44f1ceb65b1e72bacef2ca2" ON "user_profile" USING btree ("pinnedPageId");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_USER_PUBLICKEY_KEY_ID_UNIQUE" ON "user_publickey" USING btree ("keyId");--> statement-breakpoint
CREATE INDEX "IDX_USER_SECURITY_KEY_USER_ID" ON "user_security_key" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_USER_SECURITY_KEY_PUBLIC_KEY" ON "user_security_key" USING btree ("publicKey");--> statement-breakpoint
CREATE INDEX "IDX_USER_FOLLOWERS_COUNT" ON "user" USING btree ("followersCount");--> statement-breakpoint
CREATE INDEX "IDX_USER_UPDATED_AT" ON "user" USING btree ("updatedAt");--> statement-breakpoint
CREATE INDEX "IDX_USER_LAST_ACTIVE_DATE" ON "user" USING btree ("lastActiveDate");--> statement-breakpoint
CREATE INDEX "IDX_USER_USERNAME_LOWER" ON "user" USING btree ("usernameLower");--> statement-breakpoint
CREATE INDEX "IDX_USER_TAGS" ON "user" USING btree ("tags");--> statement-breakpoint
CREATE INDEX "IDX_USER_IS_EXPLORABLE" ON "user" USING btree ("isExplorable");--> statement-breakpoint
CREATE INDEX "IDX_USER_HOST" ON "user" USING btree ("host");--> statement-breakpoint
CREATE INDEX "IDX_USER_URI" ON "user" USING btree ("uri");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_USER_TOKEN_UNIQUE" ON "user" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "IDX_USER_USERNAME_LOWER_HOST_UNIQUE" ON "user" USING btree ("usernameLower","host");--> statement-breakpoint
CREATE UNIQUE INDEX "REL_58f5c71eaab331645112cf8cfa" ON "user" USING btree ("avatarId");--> statement-breakpoint
CREATE UNIQUE INDEX "REL_afc64b53f8db3707ceb34eb28e" ON "user" USING btree ("bannerId");--> statement-breakpoint
CREATE INDEX "IDX_WEBHOOK_USER_ID" ON "webhook" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "IDX_WEBHOOK_ON" ON "webhook" USING btree ("on");--> statement-breakpoint
CREATE INDEX "IDX_WEBHOOK_ACTIVE" ON "webhook" USING btree ("active");