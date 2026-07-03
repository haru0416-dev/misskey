/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Hono, type Context } from 'hono';
import type * as Redis from 'ioredis';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { DownloadService } from '@/core/DownloadService.js';
import type { FileInfoService } from '@/core/FileInfoService.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import type { ImageProcessingService } from '@/core/ImageProcessingService.js';
import type { InternalStorageService } from '@/core/InternalStorageService.js';
import type { S3Service } from '@/core/S3Service.js';
import type { UserAuthService } from '@/core/UserAuthService.js';
import type { VideoProcessingService } from '@/core/VideoProcessingService.js';
import type { WebAuthnService } from '@/core/WebAuthnService.js';
import type { EmailService } from '@/core/EmailService.js';
import type Logger from '@/logger.js';
import { listActiveInstanceHostsFromDatabase } from '@/core/InstanceStore.js';
import { assertCredential, assertOptionalCredential, assertProhibitMoved, assertSecureCredential, assertTokenPermission, authenticateHonoApiToken, type HonoApiAuthenticated } from './hono-api-auth.js';
import { handleHonoApiAdminAbuseUserReports, handleHonoApiAdminForwardAbuseUserReport, handleHonoApiAdminResolveAbuseUserReport, handleHonoApiAdminUpdateAbuseUserReport } from './hono-api-admin-abuse-reports.js';
import { handleHonoApiAdminAbuseReportNotificationRecipientCreate, handleHonoApiAdminAbuseReportNotificationRecipientDelete, handleHonoApiAdminAbuseReportNotificationRecipientList, handleHonoApiAdminAbuseReportNotificationRecipientShow, handleHonoApiAdminAbuseReportNotificationRecipientUpdate } from './hono-api-admin-abuse-report-notification-recipient.js';
import { handleHonoApiAdminAccountsCreate, handleHonoApiAdminAccountsDelete, handleHonoApiAdminAccountsFindByEmail, handleHonoApiAdminDeleteAccount, handleHonoApiAdminUpdateProxyAccount } from './hono-api-admin-accounts.js';
import { handleHonoApiAdminAdCreate, handleHonoApiAdminAdDelete, handleHonoApiAdminAdList, handleHonoApiAdminAdUpdate } from './hono-api-admin-ad.js';
import { handleHonoApiAdminAnnouncementsCreate, handleHonoApiAdminAnnouncementsDelete, handleHonoApiAdminAnnouncementsList, handleHonoApiAdminAnnouncementsUpdate } from './hono-api-admin-announcements.js';
import { handleHonoApiAdminAvatarDecorationsCreate, handleHonoApiAdminAvatarDecorationsDelete, handleHonoApiAdminAvatarDecorationsList, handleHonoApiAdminAvatarDecorationsUpdate } from './hono-api-admin-avatar-decorations.js';
import { handleHonoApiAdminRelaysAdd, handleHonoApiAdminRelaysList, handleHonoApiAdminRelaysRemove } from './hono-api-admin-relays.js';
import { handleHonoApiAdminRolesAssign, handleHonoApiAdminRolesCreate, handleHonoApiAdminRolesDelete, handleHonoApiAdminRolesList, handleHonoApiAdminRolesShow, handleHonoApiAdminRolesUnassign, handleHonoApiAdminRolesUpdate, handleHonoApiAdminRolesUpdateDefaultPolicies, handleHonoApiAdminRolesUsers } from './hono-api-admin-roles.js';
import { handleHonoApiAdminSendEmail } from './hono-api-admin-email.js';
import { handleHonoApiAdminServerInfo } from './hono-api-admin-server-info.js';
import { handleHonoApiAdminGetIndexStats, handleHonoApiAdminGetTableStats } from './hono-api-admin-stats.js';
import { handleHonoApiAdminSystemWebhookCreate, handleHonoApiAdminSystemWebhookDelete, handleHonoApiAdminSystemWebhookList, handleHonoApiAdminSystemWebhookShow, handleHonoApiAdminSystemWebhookTest, handleHonoApiAdminSystemWebhookUpdate } from './hono-api-admin-system-webhooks.js';
import { handleHonoApiAdminGetUserIps } from './hono-api-admin-user-ips.js';
import { handleHonoApiAdminResetPassword, handleHonoApiAdminUnsetMfa, handleHonoApiAdminUnsetUserAvatar, handleHonoApiAdminUnsetUserBanner, handleHonoApiAdminUpdateUserNote } from './hono-api-admin-user-maintenance.js';
import { handleHonoApiAdminSuspendUser, handleHonoApiAdminUnsuspendUser } from './hono-api-admin-user-suspension.js';
import { handleHonoApiAdminShowUser, handleHonoApiAdminShowUsers } from './hono-api-admin-users.js';
import { handleHonoApiGetAvatarDecorations } from './hono-api-avatar-decorations.js';
import { handleHonoApiEmailAddressAvailable, handleHonoApiGetOnlineUsersCount, handleHonoApiUsernameAvailable } from './hono-api-availability.js';
import { handleHonoApiAppCreate, handleHonoApiAppShow, handleHonoApiIAuthorizedApps, handleHonoApiIApps, handleHonoApiIRevokeToken, handleHonoApiMyApps } from './hono-api-app.js';
import { handleHonoApiAuthAccept, handleHonoApiAuthSessionGenerate, handleHonoApiAuthSessionShow, handleHonoApiAuthSessionUserkey } from './hono-api-auth-session.js';
import { handleHonoApiBlockingCreate, handleHonoApiBlockingDelete, handleHonoApiBlockingList } from './hono-api-account-blocking.js';
import { handleHonoApiMuteCreate, handleHonoApiMuteDelete, handleHonoApiMuteList, handleHonoApiRenoteMuteCreate, handleHonoApiRenoteMuteDelete, handleHonoApiRenoteMuteList } from './hono-api-account-mutes.js';
import { HonoApiError, invalidJsonBody, rolePermissionDeniedError } from './hono-api-error.js';
import { handleHonoApiAdminEmojiAdd, handleHonoApiAdminEmojiAddAliasesBulk, handleHonoApiAdminEmojiCopy, handleHonoApiAdminEmojiDelete, handleHonoApiAdminEmojiDeleteBulk, handleHonoApiAdminEmojiImportZip, handleHonoApiAdminEmojiList, handleHonoApiAdminEmojiListRemote, handleHonoApiAdminEmojiRemoveAliasesBulk, handleHonoApiAdminEmojiSetAliasesBulk, handleHonoApiAdminEmojiSetCategoryBulk, handleHonoApiAdminEmojiSetLicenseBulk, handleHonoApiAdminEmojiUpdate, handleHonoApiEmoji, handleHonoApiEmojis } from './hono-api-emojis.js';
import { handleHonoApiEndpoint, handleHonoApiEndpoints } from './hono-api-endpoints.js';
import {
	handleHonoApiDriveFilesCheckExistence,
	handleHonoApiDriveFolders,
	handleHonoApiDriveFoldersCreate,
	handleHonoApiDriveFoldersDelete,
	handleHonoApiDriveFoldersFind,
	handleHonoApiDriveFoldersShow,
	handleHonoApiDriveFoldersUpdate,
} from './hono-api-drive.js';
import { handleHonoApiGalleryFeatured, handleHonoApiGalleryPopular, handleHonoApiGalleryPosts, handleHonoApiGalleryPostsCreate, handleHonoApiGalleryPostsDelete, handleHonoApiGalleryPostsLike, handleHonoApiGalleryPostsShow, handleHonoApiGalleryPostsUnlike, handleHonoApiGalleryPostsUpdate } from './hono-api-gallery.js';
import { handleHonoApiAdminFederationDeleteAllFiles, handleHonoApiAdminFederationRefreshRemoteInstanceMetadata, handleHonoApiAdminFederationRemoveAllFollowing, handleHonoApiAdminFederationUpdateInstance, handleHonoApiFederationFollowers, handleHonoApiFederationFollowing, handleHonoApiFederationInstances, handleHonoApiFederationShowInstance, handleHonoApiFederationStats, handleHonoApiFederationUsers, normalizeHonoApiFederationQuery } from './hono-api-federation.js';
import { handleHonoApiFetchExternalResources } from './hono-api-fetch-external-resources.js';
import { handleHonoApiExportCustomEmojis, handleHonoApiIExportAntennas, handleHonoApiIExportBlocking, handleHonoApiIExportClips, handleHonoApiIExportFavorites, handleHonoApiIExportFollowing, handleHonoApiIExportMute, handleHonoApiIExportNotes, handleHonoApiIExportUserLists } from './hono-api-export-jobs.js';
import { handleHonoApiFetchRss } from './hono-api-fetch-rss.js';
import { handleHonoApiChannelsFavorite, handleHonoApiChannelsUnfavorite, handleHonoApiClipsFavorite, handleHonoApiClipsUnfavorite, handleHonoApiFlashLike, handleHonoApiFlashUnlike, handleHonoApiPagesLike, handleHonoApiPagesUnlike, handleHonoApiUsersListsFavorite, handleHonoApiUsersListsUnfavorite } from './hono-api-favorites.js';
import { handleHonoApiClipsAddNote, handleHonoApiClipsCreate, handleHonoApiClipsDelete, handleHonoApiClipsList, handleHonoApiClipsMyFavorites, handleHonoApiClipsNotes, handleHonoApiClipsRemoveNote, handleHonoApiClipsShow, handleHonoApiClipsUpdate } from './hono-api-clips.js';
import { handleHonoApiChannelsCreate, handleHonoApiChannelsFeatured, handleHonoApiChannelsFollow, handleHonoApiChannelsFollowed, handleHonoApiChannelsMuteCreate, handleHonoApiChannelsMuteDelete, handleHonoApiChannelsMuteList, handleHonoApiChannelsMyFavorites, handleHonoApiChannelsOwned, handleHonoApiChannelsSearch, handleHonoApiChannelsShow, handleHonoApiChannelsTimeline, handleHonoApiChannelsUnfollow, handleHonoApiChannelsUpdate } from './hono-api-channels.js';
import { handleHonoApiChartsActiveUsers, handleHonoApiChartsApRequest, handleHonoApiChartsDrive, handleHonoApiChartsFederation, handleHonoApiChartsInstance, handleHonoApiChartsNotes, handleHonoApiChartsUserDrive, handleHonoApiChartsUserFollowing, handleHonoApiChartsUserNotes, handleHonoApiChartsUserPv, handleHonoApiChartsUserReactions, handleHonoApiChartsUsers, normalizeHonoApiChartQuery } from './hono-api-charts.js';
import { handleHonoApiAdminCaptchaCurrent, handleHonoApiAdminCaptchaSave } from './hono-api-captcha.js';
import { handleHonoApiAdminQueueClear, handleHonoApiAdminQueueDeliverDelayed, handleHonoApiAdminQueueInboxDelayed, handleHonoApiAdminQueueJobs, handleHonoApiAdminQueuePause, handleHonoApiAdminQueuePromoteJobs, handleHonoApiAdminQueueQueueStats, handleHonoApiAdminQueueQueues, handleHonoApiAdminQueueRemoveJob, handleHonoApiAdminQueueResume, handleHonoApiAdminQueueRetryJob, handleHonoApiAdminQueueShowJob, handleHonoApiAdminQueueShowJobLogs, handleHonoApiAdminQueueStats, type HonoApiAdminQueueDependencies } from './hono-api-admin-queue.js';
import { handleHonoApiAdminDeleteAllFilesOfAUser, handleHonoApiAdminDriveCleanRemoteFiles, handleHonoApiAdminDriveCleanup, handleHonoApiAdminDriveFiles, handleHonoApiAdminDriveShowFile } from './hono-api-admin-drive.js';
import { handleHonoApiFlashUpdate } from './hono-api-flash.js';
import { handleHonoApiFollowingCreate, handleHonoApiFollowingDelete, handleHonoApiFollowingInvalidate, handleHonoApiFollowingList, handleHonoApiFollowingRequestsAccept, handleHonoApiFollowingRequestsCancel, handleHonoApiFollowingRequestsList, handleHonoApiFollowingRequestsReject, handleHonoApiFollowingRequestsSent, handleHonoApiFollowingUpdate, handleHonoApiFollowingUpdateAll } from './hono-api-following.js';
import { handleHonoApiHashtagsList, handleHonoApiHashtagsSearch, handleHonoApiHashtagsShow, handleHonoApiHashtagsTrend } from './hono-api-hashtags.js';
import { handleHonoApiI, handleHonoApiISigninHistory } from './hono-api-i.js';
import { handleHonoApiPinnedUsers } from './hono-api-user.js';
import { handleHonoApiAnnouncements, handleHonoApiAnnouncementShow, handleHonoApiIReadAnnouncement } from './hono-api-announcements.js';
import { handleHonoApiAdminInviteCreate, handleHonoApiAdminInviteList, handleHonoApiInviteCreate, handleHonoApiInviteDelete, handleHonoApiInviteLimit, handleHonoApiInviteList } from './hono-api-invite.js';
import { handleHonoApiAdminMeta, handleHonoApiAdminUpdateMeta, handleHonoApiMeta, handleHonoApiPing, handleHonoApiServerInfo, handleHonoApiTest } from './hono-api-meta.js';
import { handleHonoApiMiauthCheck, handleHonoApiMiauthGenToken } from './hono-api-miauth.js';
import { handleHonoApiAdminShowModerationLogs } from './hono-api-moderation-log.js';
import { handleHonoApiNotesDraftsCount, handleHonoApiNotesDraftsCreate, handleHonoApiNotesDraftsDelete, handleHonoApiNotesDraftsList, handleHonoApiNotesDraftsUpdate } from './hono-api-note-drafts.js';
import { handleHonoApiIClaimAchievement, handleHonoApiNotificationsCreate, handleHonoApiNotificationsFlush, handleHonoApiNotificationsMarkAllAsRead, handleHonoApiNotificationsTestNotification, type HonoApiMainStreamPublisher } from './hono-api-notification.js';
import { handleHonoApiNotesChildren, handleHonoApiNotesClips, handleHonoApiNotesConversation, handleHonoApiNotesFavoritesCreate, handleHonoApiNotesFavoritesDelete, handleHonoApiNotesFeatured, handleHonoApiNotesGlobalTimeline, handleHonoApiNotesHybridTimeline, handleHonoApiNotesLocalTimeline, handleHonoApiNotesMentions, handleHonoApiNotesPollsRecommendation, handleHonoApiNotesRenotes, handleHonoApiNotesReplies, handleHonoApiNotesSearch, handleHonoApiNotesSearchByTag, handleHonoApiNotesShow, handleHonoApiNotesShowPartialBulk, handleHonoApiNotesState, handleHonoApiNotesThreadMutingCreate, handleHonoApiNotesThreadMutingDelete, handleHonoApiNotesTimeline, handleHonoApiNotesUserListTimeline, normalizeHonoApiNotesFeaturedQuery } from './hono-api-notes.js';
import { handleHonoApiPagePush } from './hono-api-page-push.js';
import { handleHonoApiRequestResetPassword, handleHonoApiResetPassword } from './hono-api-password-reset.js';
import { handleHonoApiAdminPromoCreate, handleHonoApiPromoRead } from './hono-api-promo.js';
import { assertHonoApiRateLimit } from './hono-api-rate-limit.js';
import { handleHonoApiResetDb } from './hono-api-reset-db.js';
import { getHonoApiRolePolicies, isHonoApiAdministrator, isHonoApiModerator } from './hono-api-role-policy.js';
import {
	handleHonoApiRegistryGet,
	handleHonoApiRegistryGetAll,
	handleHonoApiRegistryGetDetail,
	handleHonoApiRegistryKeys,
	handleHonoApiRegistryKeysWithType,
	handleHonoApiRegistryRemove,
	handleHonoApiRegistryScopesWithDomain,
	handleHonoApiRegistrySet,
} from './hono-api-registry.js';
import { handleHonoApiRetention } from './hono-api-retention.js';
import { handleHonoApiRolesList, handleHonoApiRolesNotes, handleHonoApiRolesShow, handleHonoApiRolesUsers } from './hono-api-roles.js';
import { handleHonoApiSigninFlow, type HonoApiSigninFlowResult } from './hono-api-signin.js';
import { handleHonoApiSigninWithPasskey, type HonoApiSigninWithPasskeyResult } from './hono-api-signin-with-passkey.js';
import type { HonoApiBroadcastStreamPublisher, HonoApiDriveStreamPublisher, HonoApiInternalEventPublisher } from './hono-api-events.js';
import { signupPendingWithHonoApi, signupWithHonoApi } from './hono-api-signup.js';
import { handleHonoApiSwRegister, handleHonoApiSwShowRegistration, handleHonoApiSwUnregister, handleHonoApiSwUpdateRegistration } from './hono-api-sw.js';
import { handleHonoApiUsersAchievements, handleHonoApiUsersListsDelete, handleHonoApiUsersListsList, handleHonoApiUsersListsShow, handleHonoApiUsersListsUpdate } from './hono-api-users.js';
import { handleHonoApiVerifyEmail } from './hono-api-verify-email.js';
import { handleHonoApiIWebhooksCreate, handleHonoApiIWebhooksDelete, handleHonoApiIWebhooksList, handleHonoApiIWebhooksShow, handleHonoApiIWebhooksUpdate } from './hono-api-webhooks.js';

export type ApiShellDependencies = HonoApiAdminQueueDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	dbPool: MiDrizzlePool;
	meta: MiMeta;
	redis: Redis.Redis;
	downloadService: Pick<DownloadService, 'downloadUrl'>;
	fileInfoService: Pick<FileInfoService, 'getFileInfo'>;
	httpRequestService: HttpRequestService;
	imageProcessingService: Pick<ImageProcessingService, 'convertSharpToPng' | 'convertSharpToWebp'>;
	internalStorageService: Pick<InternalStorageService, 'del' | 'saveFromBuffer' | 'saveFromPath'>;
	s3Service: Pick<S3Service, 'upload'>;
	userAuthService: Pick<UserAuthService, 'twoFactorAuthenticate'>;
	videoProcessingService: Pick<VideoProcessingService, 'generateVideoThumbnail'>;
	webAuthnService: Pick<WebAuthnService, 'initiateAuthentication' | 'verifyAuthentication' | 'initiateSignInWithPasskeyAuthentication' | 'verifySignInWithPasskeyAuthentication'>;
	emailService: Pick<EmailService, 'sendEmail' | 'validateEmailForAccount'>;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
	publishInternalEvent?: HonoApiInternalEventPublisher;
	publishBroadcastStream?: HonoApiBroadcastStreamPublisher;
	publishMainStream?: HonoApiMainStreamPublisher;
	publishDriveStream?: HonoApiDriveStreamPublisher;
};

const unknownApiEndpoint = {
	error: {
		message: 'Unknown API endpoint.',
		code: 'UNKNOWN_API_ENDPOINT',
		id: '2ca3b769-540a-4f08-9dd5-b5a825b6d0f1',
		kind: 'client',
	},
};

function setApiHeaders(c: Context): void {
	c.header('Access-Control-Allow-Origin', '*');
	c.header('Cache-Control', 'private, max-age=0, must-revalidate');
}

function jsonResponse(c: Context, body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	setApiHeaders(c);
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'private, max-age=0, must-revalidate',
			'Content-Type': 'application/json; charset=utf-8',
			...headers,
		},
	});
}

function emptyResponse(c: Context): Response {
	setApiHeaders(c);
	return new Response(null, {
		status: 204,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'private, max-age=0, must-revalidate',
		},
	});
}

function signinFlowResponse(c: Context, deps: ApiShellDependencies, result: HonoApiSigninFlowResult): Response {
	setApiHeaders(c);
	const headers: Record<string, string> = {
		'Access-Control-Allow-Origin': deps.config.url,
		'Access-Control-Allow-Credentials': 'true',
		'Cache-Control': 'private, max-age=0, must-revalidate',
	};

	if (result.body === undefined) {
		return new Response(null, {
			status: result.status,
			headers,
		});
	}

	return new Response(JSON.stringify(result.body), {
		status: result.status,
		headers: {
			...headers,
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
}

function signinWithPasskeyResponse(c: Context, deps: ApiShellDependencies, result: HonoApiSigninWithPasskeyResult): Response {
	setApiHeaders(c);
	return new Response(JSON.stringify(result.body), {
		status: result.status,
		headers: {
			'Access-Control-Allow-Origin': deps.config.url,
			'Access-Control-Allow-Credentials': 'true',
			'Cache-Control': 'private, max-age=0, must-revalidate',
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
}

function publicCacheHeadersWhenAnonymous(auth: HonoApiAuthenticated, seconds: number): Record<string, string> {
	return auth.user == null ? { 'Cache-Control': `public, max-age=${seconds}` } : {};
}

function apiErrorResponse(c: Context, err: HonoApiError): Response {
	setApiHeaders(c);
	return new Response(JSON.stringify(err.toBody()), {
		status: err.status,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Cache-Control': 'private, max-age=0, must-revalidate',
			'Content-Type': 'application/json; charset=utf-8',
			...err.headers,
		},
	});
}

async function jsonBody(c: Context): Promise<Record<string, unknown>> {
	try {
		const body = await c.req.json();
		return body != null && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
	} catch {
		throw invalidJsonBody();
	}
}

function tokenFromRequest(c: Context, body: Record<string, unknown>): string | null {
	const authorization = c.req.header('authorization');
	if (authorization != null) {
		const match = authorization.match(/^Bearer\s+(.+)$/i);
		if (match) return match[1];
	}

	return typeof body.i === 'string' ? body.i : null;
}

function getRequestIp(c: Context, config: Config): string {
	if (config.trustProxy !== false) {
		const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
		if (forwardedFor) return forwardedFor;

		const realIp = c.req.header('x-real-ip');
		if (realIp) return realIp;

		const cfConnectingIp = c.req.header('cf-connecting-ip');
		if (cfConnectingIp) return cfConnectingIp;
	}

	return c.req.header('x-misskey-remote-address') ?? '0.0.0.0';
}

async function runApiEndpoint(c: Context, handler: () => Promise<Response>): Promise<Response> {
	try {
		return await handler();
	} catch (err) {
		if (err instanceof HonoApiError) {
			return apiErrorResponse(c, err);
		}

		throw err;
	}
}

async function authenticateOptionalRequest(
	deps: ApiShellDependencies,
	c: Context,
	body: Record<string, unknown>,
): Promise<HonoApiAuthenticated> {
	const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
	assertOptionalCredential(auth);
	return auth;
}

async function assertHonoApiModerator(deps: ApiShellDependencies, auth: { user: NonNullable<HonoApiAuthenticated['user']> }): Promise<void> {
	if (!await isHonoApiModerator(deps, auth.user)) {
		throw rolePermissionDeniedError();
	}
}

async function assertHonoApiAdmin(deps: ApiShellDependencies, auth: { user: NonNullable<HonoApiAuthenticated['user']> }): Promise<void> {
	if (!await isHonoApiAdministrator(deps, auth.user)) {
		throw rolePermissionDeniedError();
	}
}

async function assertHonoApiCanManageAvatarDecorations(deps: ApiShellDependencies, auth: { user: NonNullable<HonoApiAuthenticated['user']> }): Promise<void> {
	if (!(await getHonoApiRolePolicies(deps, auth.user)).canManageAvatarDecorations) {
		throw rolePermissionDeniedError();
	}
}

async function assertHonoApiCanManageCustomEmojis(deps: ApiShellDependencies, auth: { user: NonNullable<HonoApiAuthenticated['user']> }): Promise<void> {
	if (!(await getHonoApiRolePolicies(deps, auth.user)).canManageCustomEmojis) {
		throw rolePermissionDeniedError();
	}
}

export function createApiShellApp(deps: ApiShellDependencies): Hono {
	const app = new Hono();

	app.use('*', async (c, next) => {
		setApiHeaders(c);
		await next();
	});

	app.options('*', (c) => {
		c.header('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS');
		const requestedHeaders = c.req.header('Access-Control-Request-Headers');
		if (requestedHeaders != null) {
			c.header('Access-Control-Allow-Headers', requestedHeaders);
		}
		return c.body(null, 204);
	});

	app.get('/v1/instance/peers', async (c) => {
		return jsonResponse(c, await listActiveInstanceHostsFromDatabase(deps.db));
	});

	app.post('/signup', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await signupWithHonoApi(deps, body ?? {}));
		});
	});

	app.post('/signup-pending', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return signinFlowResponse(c, deps, await signupPendingWithHonoApi(deps, {
				body,
				headers: c.req.raw.headers,
				ip: getRequestIp(c, deps.config),
			}));
		});
	});

	app.post('/signin-flow', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return signinFlowResponse(c, deps, await handleHonoApiSigninFlow(deps, {
				body,
				headers: c.req.raw.headers,
				ip: getRequestIp(c, deps.config),
			}));
		});
	});

	app.post('/signin-with-passkey', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return signinWithPasskeyResponse(c, deps, await handleHonoApiSigninWithPasskey(deps, {
				body,
				headers: c.req.raw.headers,
				ip: getRequestIp(c, deps.config),
			}));
		});
	});

	app.post('/app/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAppCreate(deps, auth.user, body));
		});
	});

	app.post('/app/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAppShow(deps, auth.user, auth.user != null && auth.token == null, body));
		});
	});

	app.post('/admin/accounts/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertOptionalCredential(auth);

			return jsonResponse(c, await handleHonoApiAdminAccountsCreate(deps, auth, body));
		});
	});

	app.post('/admin/accounts/find-by-email', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:account');
			await assertHonoApiAdmin(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminAccountsFindByEmail(deps, body));
		});
	});

	app.post('/admin/meta', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:meta');
			await assertHonoApiAdmin(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminMeta(deps));
		});
	});

	app.post('/admin/update-meta', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:meta');
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminUpdateMeta(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/update-proxy-account', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:account');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminUpdateProxyAccount(deps, auth.user, body));
		});
	});

	app.post('/admin/accounts/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:account');
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminAccountsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/delete-account', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:delete-account');
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminDeleteAccount(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/abuse-report/notification-recipient/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminAbuseReportNotificationRecipientCreate(deps, auth.user, body));
		});
	});

	app.post('/admin/abuse-report/notification-recipient/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminAbuseReportNotificationRecipientDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/abuse-report/notification-recipient/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminAbuseReportNotificationRecipientList(deps, body));
		});
	});

	app.post('/admin/abuse-report/notification-recipient/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminAbuseReportNotificationRecipientShow(deps, body));
		});
	});

	app.post('/admin/abuse-report/notification-recipient/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminAbuseReportNotificationRecipientUpdate(deps, auth.user, body));
		});
	});

	app.post('/admin/resolve-abuse-user-report', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:resolve-abuse-user-report');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminResolveAbuseUserReport(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/forward-abuse-user-report', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:resolve-abuse-user-report');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminForwardAbuseUserReport(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/abuse-user-reports', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:abuse-user-reports');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminAbuseUserReports(deps, body));
		});
	});

	app.post('/admin/update-abuse-user-report', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:resolve-abuse-user-report');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminUpdateAbuseUserReport(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/ad/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:ad');

			return jsonResponse(c, await handleHonoApiAdminAdCreate(deps, auth.user, body));
		});
	});

	app.post('/admin/ad/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:ad');

			await handleHonoApiAdminAdDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/ad/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiModerator(deps, auth);
			assertTokenPermission(auth, 'read:admin:ad');

			return jsonResponse(c, await handleHonoApiAdminAdList(deps, body));
		});
	});

	app.post('/admin/ad/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:ad');

			await handleHonoApiAdminAdUpdate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/announcements/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:announcements');

			return jsonResponse(c, await handleHonoApiAdminAnnouncementsCreate(deps, auth.user, body));
		});
	});

	app.post('/admin/announcements/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:announcements');

			await handleHonoApiAdminAnnouncementsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/announcements/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiModerator(deps, auth);
			assertTokenPermission(auth, 'read:admin:announcements');

			return jsonResponse(c, await handleHonoApiAdminAnnouncementsList(deps, body));
		});
	});

	app.post('/admin/announcements/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:announcements');

			await handleHonoApiAdminAnnouncementsUpdate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/avatar-decorations/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:avatar-decorations');
			await assertHonoApiCanManageAvatarDecorations(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminAvatarDecorationsCreate(deps, auth.user, body));
		});
	});

	app.post('/admin/avatar-decorations/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:avatar-decorations');
			await assertHonoApiCanManageAvatarDecorations(deps, auth);

			await handleHonoApiAdminAvatarDecorationsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/avatar-decorations/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:avatar-decorations');
			await assertHonoApiCanManageAvatarDecorations(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminAvatarDecorationsList(deps, body));
		});
	});

	app.post('/admin/avatar-decorations/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:avatar-decorations');
			await assertHonoApiCanManageAvatarDecorations(deps, auth);

			await handleHonoApiAdminAvatarDecorationsUpdate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/invite/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:invite-codes');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminInviteCreate(deps, auth.user, body));
		});
	});

	app.post('/admin/invite/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:invite-codes');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminInviteList(deps, body));
		});
	});

	app.post('/admin/roles/assign', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:roles');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminRolesAssign(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/roles/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:roles');
			await assertHonoApiAdmin(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminRolesCreate(deps, auth.user, body));
		});
	});

	app.post('/admin/roles/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:roles');
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminRolesDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/roles/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:roles');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminRolesList(deps, body));
		});
	});

	app.post('/admin/roles/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:roles');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminRolesShow(deps, body));
		});
	});

	app.post('/admin/roles/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:roles');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminRolesUsers(deps, body));
		});
	});

	app.post('/admin/roles/unassign', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:roles');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminRolesUnassign(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/roles/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:roles');
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminRolesUpdate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/roles/update-default-policies', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:roles');
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminRolesUpdateDefaultPolicies(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/system-webhook/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminSystemWebhookCreate(deps, auth.user, body));
		});
	});

	app.post('/admin/system-webhook/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminSystemWebhookDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/system-webhook/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminSystemWebhookList(deps, body));
		});
	});

	app.post('/admin/system-webhook/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminSystemWebhookShow(deps, body));
		});
	});

	app.post('/admin/system-webhook/test', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminSystemWebhookTest(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/system-webhook/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminSystemWebhookUpdate(deps, auth.user, body));
		});
	});

	app.post('/admin/show-moderation-logs', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:show-moderation-log');
			await assertHonoApiAdmin(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminShowModerationLogs(deps, body));
		});
	});

	app.post('/admin/get-user-ips', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiAdmin(deps, auth);
			assertTokenPermission(auth, 'read:admin:user-ips');

			return jsonResponse(c, await handleHonoApiAdminGetUserIps(deps, body));
		});
	});

	app.post('/admin/show-user', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:show-user');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminShowUser(deps, auth.user, body));
		});
	});

	app.post('/admin/show-users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:show-user');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminShowUsers(deps, auth.user, body));
		});
	});

	app.post('/admin/server-info', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:server-info');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminServerInfo(deps, body));
		});
	});

	app.post('/admin/relays/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:relays');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminRelaysList(deps, body));
		});
	});

	app.post('/admin/relays/add', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:relays');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminRelaysAdd(deps, body));
		});
	});

	app.post('/admin/relays/remove', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:relays');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminRelaysRemove(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/federation/update-instance', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:federation');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminFederationUpdateInstance(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/federation/refresh-remote-instance-metadata', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:federation');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminFederationRefreshRemoteInstanceMetadata(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/federation/remove-all-following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:federation');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminFederationRemoveAllFollowing(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/federation/delete-all-files', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:federation');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminFederationDeleteAllFiles(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/drive/clean-remote-files', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:drive');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminDriveCleanRemoteFiles(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/drive/cleanup', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:drive');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminDriveCleanup(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/delete-all-files-of-a-user', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:delete-all-files-of-a-user');
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminDeleteAllFilesOfAUser(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/drive/files', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:drive');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminDriveFiles(deps, body));
		});
	});

	app.post('/admin/drive/show-file', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:drive');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminDriveShowFile(deps, auth.user, body));
		});
	});

	app.post('/admin/promo/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:promo');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminPromoCreate(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/reset-password', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:reset-password');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminResetPassword(deps, auth.user, body));
		});
	});

	app.post('/admin/unset-mfa', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:unset-mfa');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminUnsetMfa(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/unset-user-avatar', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:unset-user-avatar');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminUnsetUserAvatar(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/unset-user-banner', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:unset-user-banner');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminUnsetUserBanner(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/update-user-note', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:user-note');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminUpdateUserNote(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/suspend-user', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:suspend-user');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminSuspendUser(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/unsuspend-user', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:unsuspend-user');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminUnsuspendUser(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/send-email', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:send-email');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminSendEmail(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/queue/queues', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueQueues(deps, body));
		});
	});

	app.post('/admin/queue/queue-stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueQueueStats(deps, body));
		});
	});

	app.post('/admin/queue/stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:emoji');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueStats(deps, body));
		});
	});

	app.post('/admin/queue/deliver-delayed', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueDeliverDelayed(deps, body));
		});
	});

	app.post('/admin/queue/inbox-delayed', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueInboxDelayed(deps, body));
		});
	});

	app.post('/admin/queue/jobs', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueJobs(deps, body));
		});
	});

	app.post('/admin/queue/show-job', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueShowJob(deps, body));
		});
	});

	app.post('/admin/queue/show-job-logs', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:queue');
			await assertHonoApiModerator(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminQueueShowJobLogs(deps, body));
		});
	});

	app.post('/admin/queue/clear', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueueClear(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/queue/pause', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueuePause(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/queue/resume', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueueResume(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/queue/promote-jobs', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueuePromoteJobs(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/queue/retry-job', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueueRetryJob(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/queue/remove-job', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:queue');
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminQueueRemoveJob(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/get-index-stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			if (!await isHonoApiAdministrator(deps, auth.user)) {
				throw rolePermissionDeniedError();
			}
			assertTokenPermission(auth, 'read:admin:index-stats');

			return jsonResponse(c, await handleHonoApiAdminGetIndexStats(deps, body));
		});
	});

	app.post('/admin/get-table-stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			if (!await isHonoApiAdministrator(deps, auth.user)) {
				throw rolePermissionDeniedError();
			}
			assertTokenPermission(auth, 'read:admin:table-stats');

			return jsonResponse(c, await handleHonoApiAdminGetTableStats(deps, body));
		});
	});

	app.post('/admin/captcha/current', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiAdmin(deps, auth);
			assertTokenPermission(auth, 'read:admin:meta');

			return jsonResponse(c, await handleHonoApiAdminCaptchaCurrent(deps, body));
		});
	});

	app.post('/admin/captcha/save', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			await assertHonoApiAdmin(deps, auth);
			assertTokenPermission(auth, 'write:admin:meta');

			await handleHonoApiAdminCaptchaSave(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/announcements', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAnnouncements(deps, auth.user, body));
		});
	});

	app.post('/announcements/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAnnouncementShow(deps, auth.user, body));
		});
	});

	app.post('/i/read-announcement', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiIReadAnnouncement(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/claim-achievement', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiIClaimAchievement(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/pinned-users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiPinnedUsers(deps, auth.user, body));
		});
	});

	app.post('/page-push', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			await handleHonoApiPagePush(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/email-address/available', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiEmailAddressAvailable(deps, body));
		});
	});

	app.post('/drive/files/check-existence', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFilesCheckExistence(deps, auth.user, body));
		});
	});

	app.post('/drive/folders', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFolders(deps, auth.user, body));
		});
	});

	app.post('/drive/folders/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:drive');
			await assertHonoApiRateLimit(deps, 'drive/folders/create', {
				duration: 60 * 60 * 1000,
				max: 10,
			}, auth.user.id);

			return jsonResponse(c, await handleHonoApiDriveFoldersCreate(deps, auth.user, body));
		});
	});

	app.post('/drive/folders/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:drive');

			await handleHonoApiDriveFoldersDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/drive/folders/find', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFoldersFind(deps, auth.user, body));
		});
	});

	app.post('/drive/folders/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:drive');

			return jsonResponse(c, await handleHonoApiDriveFoldersShow(deps, auth.user, body));
		});
	});

	app.post('/drive/folders/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:drive');

			return jsonResponse(c, await handleHonoApiDriveFoldersUpdate(deps, auth.user, body));
		});
	});

	app.get('/emoji', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiEmoji(deps, c.req.query()), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/emoji', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiEmoji(deps, body), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.get('/emojis', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiEmojis(deps), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/emojis', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, await handleHonoApiEmojis(deps), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/admin/emoji/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminEmojiList(deps, body));
		});
	});

	app.post('/admin/emoji/list-remote', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminEmojiListRemote(deps, body));
		});
	});

	app.post('/admin/emoji/add', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminEmojiAdd(deps, auth.user, body));
		});
	});

	app.post('/admin/emoji/copy', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			return jsonResponse(c, await handleHonoApiAdminEmojiCopy(deps, auth.user, body));
		});
	});

	app.post('/admin/emoji/add-aliases-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiAddAliasesBulk(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/remove-aliases-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiRemoveAliasesBulk(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/set-aliases-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiSetAliasesBulk(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/set-category-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiSetCategoryBulk(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/set-license-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiSetLicenseBulk(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/delete-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiDeleteBulk(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/import-zip', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiImportZip(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/admin/emoji/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:admin:emoji');
			await assertHonoApiCanManageCustomEmojis(deps, auth);

			await handleHonoApiAdminEmojiUpdate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/auth/session/generate', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAuthSessionGenerate(deps, body));
		});
	});

	app.post('/auth/session/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAuthSessionShow(deps, auth.user, body));
		});
	});

	app.post('/auth/session/userkey', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiAuthSessionUserkey(deps, body));
		});
	});

	app.post('/auth/accept', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			await handleHonoApiAuthAccept(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/blocking/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:blocks');
			await assertHonoApiRateLimit(deps, 'blocking/create', {
				duration: 60 * 60 * 1000,
				max: 20,
			}, auth.user.id);

			return jsonResponse(c, await handleHonoApiBlockingCreate(deps, auth.user, body));
		});
	});

	app.post('/blocking/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:blocks');
			await assertHonoApiRateLimit(deps, 'blocking/delete', {
				duration: 60 * 60 * 1000,
				max: 100,
			}, auth.user.id);

			return jsonResponse(c, await handleHonoApiBlockingDelete(deps, auth.user, body));
		});
	});

	app.post('/blocking/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:blocks');

			return jsonResponse(c, await handleHonoApiBlockingList(deps, auth.user, body));
		});
	});

	app.post('/mute/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:mutes');

			await handleHonoApiMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/mute/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:mutes');

			await handleHonoApiMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/mute/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:mutes');

			return jsonResponse(c, await handleHonoApiMuteList(deps, auth.user, body));
		});
	});

	app.post('/renote-mute/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:mutes');

			await handleHonoApiRenoteMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/renote-mute/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:mutes');

			await handleHonoApiRenoteMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/renote-mute/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:mutes');

			return jsonResponse(c, await handleHonoApiRenoteMuteList(deps, auth.user, body));
		});
	});

	app.post('/channels/favorite', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');

			await handleHonoApiChannelsFavorite(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/channels/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');
			if (!(await getHonoApiRolePolicies(deps, auth.user)).canCreateChannel) {
				throw rolePermissionDeniedError();
			}
			await assertHonoApiRateLimit(deps, 'channels/create', {
				duration: 60 * 60 * 1000,
				max: 10,
			}, auth.user.id);

			return jsonResponse(c, await handleHonoApiChannelsCreate(deps, auth.user, body));
		});
	});

	app.post('/channels/featured', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChannelsFeatured(deps, auth.user, body));
		});
	});

	app.post('/channels/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChannelsShow(deps, auth.user, body));
		});
	});

	app.post('/channels/timeline', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChannelsTimeline(deps, auth.user, body));
		});
	});

	app.post('/channels/follow', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');

			await handleHonoApiChannelsFollow(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/channels/followed', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:channels');

			return jsonResponse(c, await handleHonoApiChannelsFollowed(deps, auth.user, body));
		});
	});

	app.post('/channels/my-favorites', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:channels');

			return jsonResponse(c, await handleHonoApiChannelsMyFavorites(deps, auth.user, body));
		});
	});

	app.post('/channels/mute/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');

			await handleHonoApiChannelsMuteCreate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/channels/mute/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');

			await handleHonoApiChannelsMuteDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/channels/mute/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'read:channels');

			return jsonResponse(c, await handleHonoApiChannelsMuteList(deps, auth.user, body));
		});
	});

	app.post('/channels/owned', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:channels');

			return jsonResponse(c, await handleHonoApiChannelsOwned(deps, auth.user, body));
		});
	});

	app.post('/channels/search', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChannelsSearch(deps, auth.user, body));
		});
	});

	app.post('/channels/unfavorite', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');

			await handleHonoApiChannelsUnfavorite(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/channels/unfollow', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:channels');

			await handleHonoApiChannelsUnfollow(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/channels/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:channels');

			return jsonResponse(c, await handleHonoApiChannelsUpdate(deps, auth.user, body));
		});
	});

	app.get('/charts/active-users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsActiveUsers(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/active-users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsActiveUsers(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/ap-request', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsApRequest(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/ap-request', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsApRequest(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsDrive(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsDrive(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/federation', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsFederation(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/federation', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsFederation(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/instance', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsInstance(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/instance', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsInstance(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsNotes(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsNotes(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsUsers(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsUsers(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/user/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsUserDrive(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/user/drive', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsUserDrive(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/user/following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsUserFollowing(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/user/following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsUserFollowing(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/user/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsUserNotes(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/user/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsUserNotes(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/user/pv', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsUserPv(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/user/pv', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsUserPv(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.get('/charts/user/reactions', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiChartQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiChartsUserReactions(deps, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/charts/user/reactions', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiChartsUserReactions(deps, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/clips/favorite', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:clip-favorite');

			await handleHonoApiClipsFavorite(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/clips/unfavorite', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:clip-favorite');

			await handleHonoApiClipsUnfavorite(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/clips/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiClipsList(deps, auth.user, body));
		});
	});

	app.post('/clips/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiClipsShow(deps, auth.user, body));
		});
	});

	app.post('/clips/my-favorites', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:clip-favorite');

			return jsonResponse(c, await handleHonoApiClipsMyFavorites(deps, auth.user, body));
		});
	});

	app.post('/clips/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiClipsNotes(deps, auth.user, body));
		});
	});

	app.post('/clips/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			return jsonResponse(c, await handleHonoApiClipsCreate(deps, auth.user, body));
		});
	});

	app.post('/clips/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			return jsonResponse(c, await handleHonoApiClipsUpdate(deps, auth.user, body));
		});
	});

	app.post('/clips/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiClipsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/clips/add-note', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');
			await assertHonoApiRateLimit(deps, 'clips/add-note', {
				duration: 60 * 60 * 1000,
				max: 20,
			}, auth.user.id);

			await handleHonoApiClipsAddNote(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/clips/remove-note', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiClipsRemoveNote(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiNotesShow(deps, auth.user, body));
		});
	});

	app.post('/notes/children', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiNotesChildren(deps, auth.user, body));
		});
	});

	app.post('/notes/conversation', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiNotesConversation(deps, auth.user, body));
		});
	});

	app.post('/notes/mentions', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiNotesMentions(deps, auth.user, body));
		});
	});

	app.post('/notes/replies', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiNotesReplies(deps, auth.user, body));
		});
	});

	app.post('/notes/renotes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiNotesRenotes(deps, auth.user, body));
		});
	});

	app.post('/notes/state', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiNotesState(deps, auth.user, body));
		});
	});

	app.post('/notes/favorites/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:favorites');
			await assertHonoApiRateLimit(deps, 'notes/favorites/create', {
				duration: 60 * 60 * 1000,
				max: 20,
			}, auth.user.id);

			await handleHonoApiNotesFavoritesCreate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/favorites/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:favorites');

			await handleHonoApiNotesFavoritesDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/thread-muting/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');
			await assertHonoApiRateLimit(deps, 'notes/thread-muting/create', {
				duration: 60 * 60 * 1000,
				max: 10,
			}, auth.user.id);

			await handleHonoApiNotesThreadMutingCreate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/thread-muting/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiNotesThreadMutingDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/global-timeline', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiNotesGlobalTimeline(deps, auth.user, body));
		});
	});

	app.post('/notes/local-timeline', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiNotesLocalTimeline(deps, auth.user, body));
		});
	});

	app.post('/notes/hybrid-timeline', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiNotesHybridTimeline(deps, auth.user, body));
		});
	});

	app.get('/notes/featured', async (c) => {
		return await runApiEndpoint(c, async () => {
			const query = normalizeHonoApiNotesFeaturedQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, query);

			return jsonResponse(c, await handleHonoApiNotesFeatured(deps, auth.user, query), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/notes/featured', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiNotesFeatured(deps, auth.user, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/notes/clips', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiNotesClips(deps, auth.user, body));
		});
	});

	app.post('/notes/search', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiNotesSearch(deps, auth.user, body));
		});
	});

	app.post('/notes/search-by-tag', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiNotesSearchByTag(deps, auth.user, body));
		});
	});

	app.post('/notes/show-partial-bulk', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiNotesShowPartialBulk(deps, body));
		});
	});

	app.post('/notes/timeline', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiNotesTimeline(deps, auth.user, body));
		});
	});

	app.post('/notes/user-list-timeline', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiNotesUserListTimeline(deps, auth.user, body));
		});
	});

	app.post('/notes/polls/recommendation', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiNotesPollsRecommendation(deps, auth.user, body));
		});
	});

	app.post('/endpoints', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiEndpoints());
		});
	});

	app.post('/endpoint', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiEndpoint(body));
		});
	});

	app.get('/federation/instances', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = normalizeHonoApiFederationQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationInstances(deps, auth.user, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/federation/instances', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationInstances(deps, auth.user, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/federation/show-instance', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationShowInstance(deps, auth.user, body));
		});
	});

	app.get('/federation/stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = normalizeHonoApiFederationQuery(c.req.query());
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationStats(deps, auth.user, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/federation/stats', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationStats(deps, auth.user, body), 200, publicCacheHeadersWhenAnonymous(auth, 3600));
		});
	});

	app.post('/federation/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiFederationUsers(deps, auth.user, body));
		});
	});

	app.post('/federation/followers', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiFederationFollowers(deps, body));
		});
	});

	app.post('/federation/following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiFederationFollowing(deps, body));
		});
	});

	app.post('/fetch-external-resources', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiFetchExternalResources(deps, auth.user, body));
		});
	});

	app.post('/export-custom-emojis', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimit(deps, 'export-custom-emojis', {
				duration: 60 * 60 * 1000,
				max: 1,
			}, auth.user.id);

			handleHonoApiExportCustomEmojis(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimit(deps, 'i/export-notes', {
				duration: 24 * 60 * 60 * 1000,
				max: 1,
			}, auth.user.id);

			handleHonoApiIExportNotes(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-clips', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimit(deps, 'i/export-clips', {
				duration: 24 * 60 * 60 * 1000,
				max: 1,
			}, auth.user.id);

			handleHonoApiIExportClips(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-favorites', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimit(deps, 'i/export-favorites', {
				duration: 24 * 60 * 60 * 1000,
				max: 1,
			}, auth.user.id);

			handleHonoApiIExportFavorites(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-following', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimit(deps, 'i/export-following', {
				duration: 60 * 60 * 1000,
				max: 1,
			}, auth.user.id);

			handleHonoApiIExportFollowing(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-mute', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimit(deps, 'i/export-mute', {
				duration: 60 * 60 * 1000,
				max: 1,
			}, auth.user.id);

			handleHonoApiIExportMute(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-blocking', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimit(deps, 'i/export-blocking', {
				duration: 60 * 60 * 1000,
				max: 1,
			}, auth.user.id);

			handleHonoApiIExportBlocking(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-user-lists', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimit(deps, 'i/export-user-lists', {
				duration: 60 * 1000,
				max: 1,
			}, auth.user.id);

			handleHonoApiIExportUserLists(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/i/export-antennas', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);
			await assertHonoApiRateLimit(deps, 'i/export-antennas', {
				duration: 60 * 60 * 1000,
				max: 1,
			}, auth.user.id);

			handleHonoApiIExportAntennas(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.get('/fetch-rss', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiFetchRss(deps, c.req.query()), 200, {
				'Cache-Control': 'public, max-age=180',
			});
		});
	});

	app.post('/fetch-rss', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiFetchRss(deps, body), 200, {
				'Cache-Control': 'public, max-age=180',
			});
		});
	});

	app.post('/following/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:following');
			await assertHonoApiRateLimit(deps, 'following/create', {
				duration: 60 * 60 * 1000,
				max: 100,
			}, auth.user.id);

			return jsonResponse(c, await handleHonoApiFollowingCreate(deps, auth.user, body));
		});
	});

	app.post('/following/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:following');

			return jsonResponse(c, await handleHonoApiFollowingList(deps, auth.user, body));
		});
	});

	app.post('/following/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');
			await assertHonoApiRateLimit(deps, 'following/delete', {
				duration: 60 * 60 * 1000,
				max: 100,
			}, auth.user.id);

			return jsonResponse(c, await handleHonoApiFollowingDelete(deps, auth.user, body));
		});
	});

	app.post('/following/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');
			await assertHonoApiRateLimit(deps, 'following/update', {
				duration: 60 * 60 * 1000,
				max: 100,
			}, auth.user.id);

			return jsonResponse(c, await handleHonoApiFollowingUpdate(deps, auth.user, body));
		});
	});

	app.post('/following/invalidate', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');
			await assertHonoApiRateLimit(deps, 'following/invalidate', {
				duration: 60 * 60 * 1000,
				max: 100,
			}, auth.user.id);

			return jsonResponse(c, await handleHonoApiFollowingInvalidate(deps, auth.user, body));
		});
	});

	app.post('/following/requests/accept', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');

			await handleHonoApiFollowingRequestsAccept(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/following/requests/cancel', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');

			return jsonResponse(c, await handleHonoApiFollowingRequestsCancel(deps, auth.user, body));
		});
	});

	app.post('/following/requests/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:following');

			return jsonResponse(c, await handleHonoApiFollowingRequestsList(deps, auth.user, body));
		});
	});

	app.post('/following/requests/reject', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');

			await handleHonoApiFollowingRequestsReject(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/following/requests/sent', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:following');

			return jsonResponse(c, await handleHonoApiFollowingRequestsSent(deps, auth.user, body));
		});
	});

	app.post('/gallery/featured', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiGalleryFeatured(deps, auth.user, body));
		});
	});

	app.post('/gallery/popular', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiGalleryPopular(deps, auth.user, body));
		});
	});

	app.post('/gallery/posts', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiGalleryPosts(deps, auth.user, body));
		});
	});

	app.post('/gallery/posts/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiGalleryPostsShow(deps, auth.user, body));
		});
	});

	app.post('/gallery/posts/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:gallery');
			await assertHonoApiRateLimit(deps, 'gallery/posts/create', {
				duration: 60 * 60 * 1000,
				max: 20,
			}, auth.user.id);

			return jsonResponse(c, await handleHonoApiGalleryPostsCreate(deps, auth.user, body));
		});
	});

	app.post('/gallery/posts/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:gallery');
			await assertHonoApiRateLimit(deps, 'gallery/posts/update', {
				duration: 60 * 60 * 1000,
				max: 300,
			}, auth.user.id);

			return jsonResponse(c, await handleHonoApiGalleryPostsUpdate(deps, auth.user, body));
		});
	});

	app.post('/gallery/posts/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:gallery');

			await handleHonoApiGalleryPostsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/gallery/posts/like', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:gallery-likes');

			await handleHonoApiGalleryPostsLike(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/gallery/posts/unlike', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:gallery-likes');

			await handleHonoApiGalleryPostsUnlike(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/flash/like', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:flash-likes');

			await handleHonoApiFlashLike(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/flash/unlike', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:flash-likes');

			await handleHonoApiFlashUnlike(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/flash/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:flash');
			await assertHonoApiRateLimit(deps, 'flash/update', {
				duration: 60 * 60 * 1000,
				max: 300,
			}, auth.user.id);

			await handleHonoApiFlashUpdate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/following/update-all', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:following');
			await assertHonoApiRateLimit(deps, 'following/update-all', {
				duration: 60 * 60 * 1000,
				max: 10,
			}, auth.user.id);

			await handleHonoApiFollowingUpdateAll(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/hashtags/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiHashtagsList(deps, body));
		});
	});

	app.post('/hashtags/search', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiHashtagsSearch(deps, body));
		});
	});

	app.post('/hashtags/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiHashtagsShow(deps, body));
		});
	});

	app.post('/hashtags/trend', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiHashtagsTrend(deps, body));
		});
	});

	app.post('/invite/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:invite-codes');
			const policies = await getHonoApiRolePolicies(deps, auth.user);
			if (!policies.canInvite) {
				throw rolePermissionDeniedError();
			}

			return jsonResponse(c, await handleHonoApiInviteCreate(deps, auth.user, policies, body));
		});
	});

	app.post('/invite/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:invite-codes');
			const policies = await getHonoApiRolePolicies(deps, auth.user);
			if (!policies.canInvite) {
				throw rolePermissionDeniedError();
			}

			await handleHonoApiInviteDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/invite/limit', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:invite-codes');
			const policies = await getHonoApiRolePolicies(deps, auth.user);
			if (!policies.canInvite) {
				throw rolePermissionDeniedError();
			}

			return jsonResponse(c, await handleHonoApiInviteLimit(deps, auth.user, policies, body));
		});
	});

	app.post('/invite/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:invite-codes');
			const policies = await getHonoApiRolePolicies(deps, auth.user);
			if (!policies.canInvite) {
				throw rolePermissionDeniedError();
			}

			return jsonResponse(c, await handleHonoApiInviteList(deps, auth.user, body));
		});
	});

	app.post('/notifications/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notifications');
			await assertHonoApiRateLimit(deps, 'notifications/create', {
				duration: 1000 * 60,
				max: 10,
			}, auth.user.id);

			await handleHonoApiNotificationsCreate(deps, auth.user, auth.token, body);
			return emptyResponse(c);
		});
	});

	app.post('/notifications/flush', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notifications');

			handleHonoApiNotificationsFlush(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/notifications/mark-all-as-read', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notifications');

			handleHonoApiNotificationsMarkAllAsRead(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/notifications/test-notification', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:notifications');
			await assertHonoApiRateLimit(deps, 'notifications/test-notification', {
				duration: 1000 * 60,
				max: 10,
			}, auth.user.id);

			handleHonoApiNotificationsTestNotification(deps, auth.user);
			return emptyResponse(c);
		});
	});

	app.post('/meta', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiMeta(deps, body));
		});
	});

	app.post('/pages/like', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:page-likes');

			await handleHonoApiPagesLike(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/pages/unlike', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:page-likes');

			await handleHonoApiPagesUnlike(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/ping', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, handleHonoApiPing());
		});
	});

	app.post('/promo/read', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiPromoRead(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.get('/retention', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiRetention(deps, {}), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/retention', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiRetention(deps, body), 200, {
				'Cache-Control': 'public, max-age=3600',
			});
		});
	});

	app.post('/request-reset-password', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await handleHonoApiRequestResetPassword(deps, body, getRequestIp(c, deps.config));
			return emptyResponse(c);
		});
	});

	app.post('/reset-password', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await handleHonoApiResetPassword(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/reset-db', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await handleHonoApiResetDb(deps, body);
			return emptyResponse(c);
		});
	});

	app.post('/roles/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiRolesList(deps, body));
		});
	});

	app.post('/roles/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiRolesShow(deps, body));
		});
	});

	app.post('/roles/users', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			return jsonResponse(c, await handleHonoApiRolesUsers(deps, auth.user, body));
		});
	});

	app.post('/roles/notes', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiRolesNotes(deps, auth.user, body));
		});
	});

	app.get('/server-info', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiServerInfo(deps.meta), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/server-info', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, await handleHonoApiServerInfo(deps.meta), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/sw/register', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiSwRegister(deps, auth.user, body));
		});
	});

	app.post('/sw/show-registration', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiSwShowRegistration(deps, auth.user, body));
		});
	});

	app.post('/sw/unregister', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);

			await handleHonoApiSwUnregister(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/sw/update-registration', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiSwUpdateRegistration(deps, auth.user, body));
		});
	});

	app.post('/test', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, handleHonoApiTest(body));
		});
	});

	app.get('/get-online-users-count', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiGetOnlineUsersCount(deps), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/get-online-users-count', async (c) => {
		return await runApiEndpoint(c, async () => {
			await jsonBody(c);
			return jsonResponse(c, await handleHonoApiGetOnlineUsersCount(deps), 200, {
				'Cache-Control': 'public, max-age=60',
			});
		});
	});

	app.post('/get-avatar-decorations', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiGetAvatarDecorations(deps, body));
		});
	});

	app.post('/i', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiI(deps, auth.user, auth.token));
		});
	});

	app.post('/i/apps', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiIApps(deps, auth.user, body));
		});
	});

	app.post('/i/authorized-apps', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiIAuthorizedApps(deps, auth.user, body));
		});
	});

	app.post('/i/revoke-token', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			await handleHonoApiIRevokeToken(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/registry/get', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiRegistryGet(deps, auth.user, auth.token, body));
		});
	});

	app.post('/i/registry/get-all', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiRegistryGetAll(deps, auth.user, auth.token, body));
		});
	});

	app.post('/i/registry/get-detail', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiRegistryGetDetail(deps, auth.user, auth.token, body));
		});
	});

	app.post('/i/registry/keys', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiRegistryKeys(deps, auth.user, auth.token, body));
		});
	});

	app.post('/i/registry/keys-with-type', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiRegistryKeysWithType(deps, auth.user, auth.token, body));
		});
	});

	app.post('/i/registry/remove', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiRegistryRemove(deps, auth.user, auth.token, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/registry/scopes-with-domain', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiRegistryScopesWithDomain(deps, auth.user, body));
		});
	});

	app.post('/i/registry/set', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiRegistrySet(deps, auth.user, auth.token, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/signin-history', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiISigninHistory(deps, auth.user, body));
		});
	});

	app.post('/i/webhooks/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiIWebhooksList(deps, auth.user, body));
		});
	});

	app.post('/i/webhooks/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiIWebhooksShow(deps, auth.user, body));
		});
	});

	app.post('/i/webhooks/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiIWebhooksDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/webhooks/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiIWebhooksUpdate(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/i/webhooks/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');
			const policies = await getHonoApiRolePolicies(deps, auth.user);

			return jsonResponse(c, await handleHonoApiIWebhooksCreate(deps, auth.user, policies.webhookLimit, body));
		});
	});

	app.post('/miauth/gen-token', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertSecureCredential(auth);

			return jsonResponse(c, await handleHonoApiMiauthGenToken(deps, auth.user, body));
		});
	});

	app.post('/miauth/:session/check', async (c) => {
		return await runApiEndpoint(c, async () => {
			return jsonResponse(c, await handleHonoApiMiauthCheck(deps, c.req.param('session')));
		});
	});

	app.post('/my/apps', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiMyApps(deps, auth.user, body));
		});
	});

	app.post('/notes/drafts/count', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiNotesDraftsCount(deps, auth.user, body));
		});
	});

	app.post('/notes/drafts/create', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');
			await assertHonoApiRateLimit(deps, 'notes/drafts/create', {
				duration: 60 * 60 * 1000,
				max: 300,
			}, auth.user.id);

			return jsonResponse(c, await handleHonoApiNotesDraftsCreate(deps, auth.user, body));
		});
	});

	app.post('/notes/drafts/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');
			await assertHonoApiRateLimit(deps, 'notes/drafts/update', {
				duration: 60 * 60 * 1000,
				max: 300,
			}, auth.user.id);

			return jsonResponse(c, await handleHonoApiNotesDraftsUpdate(deps, auth.user, body));
		});
	});

	app.post('/notes/drafts/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiNotesDraftsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/notes/drafts/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertProhibitMoved(auth.user);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiNotesDraftsList(deps, auth.user, body));
		});
	});

	app.post('/users/achievements', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiUsersAchievements(deps, body));
		});
	});

	app.post('/users/lists/list', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiUsersListsList(deps, auth.user, body));
		});
	});

	app.post('/users/lists/show', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateOptionalRequest(deps, c, body);
			assertTokenPermission(auth, 'read:account');

			return jsonResponse(c, await handleHonoApiUsersListsShow(deps, auth.user, body));
		});
	});

	app.post('/users/lists/delete', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiUsersListsDelete(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/users/lists/update', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			return jsonResponse(c, await handleHonoApiUsersListsUpdate(deps, auth.user, body));
		});
	});

	app.post('/users/lists/favorite', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiUsersListsFavorite(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/users/lists/unfavorite', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			const auth = await authenticateHonoApiToken(deps, tokenFromRequest(c, body));
			assertCredential(auth);
			assertTokenPermission(auth, 'write:account');

			await handleHonoApiUsersListsUnfavorite(deps, auth.user, body);
			return emptyResponse(c);
		});
	});

	app.post('/username/available', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			return jsonResponse(c, await handleHonoApiUsernameAvailable(deps, body));
		});
	});

	app.post('/verify-email', async (c) => {
		return await runApiEndpoint(c, async () => {
			const body = await jsonBody(c);
			await authenticateOptionalRequest(deps, c, body);

			await handleHonoApiVerifyEmail(deps, body);
			return emptyResponse(c);
		});
	});

	app.all('/clear-browser-cache', (c) => {
		if (c.req.method === 'GET' || c.req.method === 'POST') {
			c.header('Clear-Site-Data', '"cache", "prefetchCache", "prerenderCache", "executionContexts"');
			return c.body(null, 204);
		}

		return c.body(null, 405);
	});

	app.all('/*', (c) => jsonResponse(c, unknownApiEndpoint, 404));

	app.notFound((c) => {
		setApiHeaders(c);
		return c.body('404 Not Found', 404);
	});

	return app;
}
