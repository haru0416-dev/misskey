/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import {
	assertCredential,
	assertOptionalCredential,
	assertSecureCredential,
	assertTokenPermission,
	authenticateHonoApiToken,
} from '../auth.js';
import {
	handleHonoApiAdminAbuseUserReports,
	handleHonoApiAdminForwardAbuseUserReport,
	handleHonoApiAdminResolveAbuseUserReport,
	handleHonoApiAdminUpdateAbuseUserReport,
} from '../admin-abuse-reports.js';
import {
	handleHonoApiAdminAbuseReportNotificationRecipientCreate,
	handleHonoApiAdminAbuseReportNotificationRecipientDelete,
	handleHonoApiAdminAbuseReportNotificationRecipientList,
	handleHonoApiAdminAbuseReportNotificationRecipientShow,
	handleHonoApiAdminAbuseReportNotificationRecipientUpdate,
} from '../admin-abuse-report-notification-recipient.js';
import {
	handleHonoApiAdminAccountsCreate,
	handleHonoApiAdminAccountsDelete,
	handleHonoApiAdminAccountsFindByEmail,
	handleHonoApiAdminDeleteAccount,
	handleHonoApiAdminUpdateProxyAccount,
} from '../admin-accounts.js';
import {
	handleHonoApiAdminAdCreate,
	handleHonoApiAdminAdDelete,
	handleHonoApiAdminAdList,
	handleHonoApiAdminAdUpdate,
} from '../admin-ad.js';
import {
	handleHonoApiAdminAnnouncementsCreate,
	handleHonoApiAdminAnnouncementsDelete,
	handleHonoApiAdminAnnouncementsList,
	handleHonoApiAdminAnnouncementsUpdate,
} from '../admin-announcements.js';
import {
	handleHonoApiAdminAvatarDecorationsCreate,
	handleHonoApiAdminAvatarDecorationsDelete,
	handleHonoApiAdminAvatarDecorationsList,
	handleHonoApiAdminAvatarDecorationsUpdate,
} from '../admin-avatar-decorations.js';
import {
	handleHonoApiAdminRelaysAdd,
	handleHonoApiAdminRelaysList,
	handleHonoApiAdminRelaysRemove,
} from '../admin-relays.js';
import {
	handleHonoApiAdminRolesAssign,
	handleHonoApiAdminRolesCreate,
	handleHonoApiAdminRolesDelete,
	handleHonoApiAdminRolesList,
	handleHonoApiAdminRolesShow,
	handleHonoApiAdminRolesUnassign,
	handleHonoApiAdminRolesUpdate,
	handleHonoApiAdminRolesUpdateDefaultPolicies,
	handleHonoApiAdminRolesUsers,
} from '../admin-roles.js';
import { handleHonoApiAdminSendEmail } from '../admin-email.js';
import { handleHonoApiAdminServerInfo } from '../admin-server-info.js';
import {
	handleHonoApiAdminSystemWebhookCreate,
	handleHonoApiAdminSystemWebhookDelete,
	handleHonoApiAdminSystemWebhookList,
	handleHonoApiAdminSystemWebhookShow,
	handleHonoApiAdminSystemWebhookTest,
	handleHonoApiAdminSystemWebhookUpdate,
} from '../admin-system-webhooks.js';
import { handleHonoApiAdminGetUserIps } from '../admin-user-ips.js';
import {
	handleHonoApiAdminResetPassword,
	handleHonoApiAdminUnsetMfa,
	handleHonoApiAdminUnsetUserAvatar,
	handleHonoApiAdminUnsetUserBanner,
	handleHonoApiAdminUpdateUserNote,
} from '../admin-user-maintenance.js';
import { handleHonoApiAdminSuspendUser, handleHonoApiAdminUnsuspendUser } from '../admin-user-suspension.js';
import { handleHonoApiAdminShowUser, handleHonoApiAdminShowUsers } from '../admin-users.js';
import {
	handleHonoApiAdminFederationDeleteAllFiles,
	handleHonoApiAdminFederationRefreshRemoteInstanceMetadata,
	handleHonoApiAdminFederationRemoveAllFollowing,
	handleHonoApiAdminFederationUpdateInstance,
} from '../federation.js';
import {
	handleHonoApiAdminDeleteAllFilesOfAUser,
	handleHonoApiAdminDriveCleanRemoteFiles,
	handleHonoApiAdminDriveCleanup,
	handleHonoApiAdminDriveFiles,
	handleHonoApiAdminDriveShowFile,
} from '../admin-drive.js';
import { handleHonoApiAdminInviteCreate, handleHonoApiAdminInviteList } from '../invite.js';
import { handleHonoApiAdminMeta, handleHonoApiAdminUpdateMeta } from '../meta.js';
import { handleHonoApiAdminShowModerationLogs } from '../moderation-log.js';
import { handleHonoApiAdminPromoCreate } from '../promo.js';
import { assertHonoApiRateLimitForUser } from '../rate-limit.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	assertHonoApiModerator,
	assertHonoApiAdmin,
	assertHonoApiCanManageAvatarDecorations,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler, endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerAdminRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/admin/accounts/create',
		endpointHandlerAnonymous(deps, 'admin/accounts/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminAccountsCreate(deps, auth, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/accounts/find-by-email',
		endpointHandler(deps, 'admin/accounts/find-by-email', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminAccountsFindByEmail(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/meta',
		endpointHandler(deps, 'admin/meta', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminMeta(deps)),
		),
	);

	app.post(
		'/admin/update-meta',
		endpointHandler(deps, 'admin/update-meta', async ({ body, auth, c }) => {
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminUpdateMeta(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/update-proxy-account',
		endpointHandler(deps, 'admin/update-proxy-account', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminUpdateProxyAccount(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/accounts/delete',
		endpointHandler(deps, 'admin/accounts/delete', async ({ body, auth, c }) => {
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminAccountsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/delete-account',
		endpointHandler(deps, 'admin/delete-account', async ({ body, auth, c }) => {
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminDeleteAccount(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/abuse-report/notification-recipient/create',
		endpointHandler(deps, 'admin/abuse-report/notification-recipient/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminAbuseReportNotificationRecipientCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/abuse-report/notification-recipient/delete',
		endpointHandler(deps, 'admin/abuse-report/notification-recipient/delete', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminAbuseReportNotificationRecipientDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/abuse-report/notification-recipient/list',
		endpointHandler(deps, 'admin/abuse-report/notification-recipient/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminAbuseReportNotificationRecipientList(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/abuse-report/notification-recipient/show',
		endpointHandler(deps, 'admin/abuse-report/notification-recipient/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminAbuseReportNotificationRecipientShow(deps, body)),
		),
	);

	app.post(
		'/admin/abuse-report/notification-recipient/update',
		endpointHandler(deps, 'admin/abuse-report/notification-recipient/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminAbuseReportNotificationRecipientUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/resolve-abuse-user-report',
		endpointHandler(deps, 'admin/resolve-abuse-user-report', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminResolveAbuseUserReport(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/forward-abuse-user-report',
		endpointHandler(deps, 'admin/forward-abuse-user-report', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminForwardAbuseUserReport(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/abuse-user-reports',
		endpointHandler(deps, 'admin/abuse-user-reports', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminAbuseUserReports(deps, body)),
		),
	);

	app.post(
		'/admin/update-abuse-user-report',
		endpointHandler(deps, 'admin/update-abuse-user-report', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminUpdateAbuseUserReport(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/ad/create',
		endpointHandler(deps, 'admin/ad/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminAdCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/ad/delete',
		endpointHandler(deps, 'admin/ad/delete', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:ad');

			await handleHonoApiAdminAdDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/ad/list',
		endpointHandler(deps, 'admin/ad/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminAdList(deps, body)),
		),
	);

	app.post(
		'/admin/ad/update',
		endpointHandler(deps, 'admin/ad/update', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:ad');

			await handleHonoApiAdminAdUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/announcements/create',
		endpointHandler(deps, 'admin/announcements/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminAnnouncementsCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/announcements/delete',
		endpointHandler(deps, 'admin/announcements/delete', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:announcements');

			await handleHonoApiAdminAnnouncementsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/announcements/list',
		endpointHandler(deps, 'admin/announcements/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminAnnouncementsList(deps, body)),
		),
	);

	app.post(
		'/admin/announcements/update',
		endpointHandler(deps, 'admin/announcements/update', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:announcements');

			await handleHonoApiAdminAnnouncementsUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

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

	app.on(['POST', 'QUERY'], '/admin/avatar-decorations/list', async (c) => {
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

	app.post(
		'/admin/invite/create',
		endpointHandler(deps, 'admin/invite/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminInviteCreate(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/invite/list',
		endpointHandler(deps, 'admin/invite/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminInviteList(deps, body)),
		),
	);

	app.post(
		'/admin/roles/assign',
		endpointHandler(deps, 'admin/roles/assign', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminRolesAssign(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/roles/create',
		endpointHandler(deps, 'admin/roles/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminRolesCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/roles/delete',
		endpointHandler(deps, 'admin/roles/delete', async ({ body, auth, c }) => {
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminRolesDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/roles/list',
		endpointHandler(deps, 'admin/roles/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminRolesList(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/roles/show',
		endpointHandler(deps, 'admin/roles/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminRolesShow(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/roles/users',
		endpointHandler(deps, 'admin/roles/users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminRolesUsers(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/roles/unassign',
		endpointHandler(deps, 'admin/roles/unassign', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminRolesUnassign(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/roles/update',
		endpointHandler(deps, 'admin/roles/update', async ({ body, auth, c }) => {
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminRolesUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/roles/update-default-policies',
		endpointHandler(deps, 'admin/roles/update-default-policies', async ({ body, auth, c }) => {
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminRolesUpdateDefaultPolicies(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/system-webhook/create',
		endpointHandler(deps, 'admin/system-webhook/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminSystemWebhookCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/system-webhook/delete',
		endpointHandler(deps, 'admin/system-webhook/delete', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminSystemWebhookDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/system-webhook/list',
		endpointHandler(deps, 'admin/system-webhook/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminSystemWebhookList(deps, body)),
		),
	);

	app.post(
		'/admin/system-webhook/show',
		endpointHandler(deps, 'admin/system-webhook/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminSystemWebhookShow(deps, body)),
		),
	);

	app.post(
		'/admin/system-webhook/test',
		endpointHandler(deps, 'admin/system-webhook/test', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);
			// 外部 URL への HTTP 配送をキューに積むので、無制限だと増幅送信の踏み台になる

			await handleHonoApiAdminSystemWebhookTest(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/system-webhook/update',
		endpointHandler(deps, 'admin/system-webhook/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminSystemWebhookUpdate(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/show-moderation-logs',
		endpointHandler(deps, 'admin/show-moderation-logs', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminShowModerationLogs(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/get-user-ips',
		endpointHandler(deps, 'admin/get-user-ips', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminGetUserIps(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/show-user',
		endpointHandler(deps, 'admin/show-user', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminShowUser(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/show-users',
		endpointHandler(deps, 'admin/show-users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminShowUsers(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/server-info',
		endpointHandler(deps, 'admin/server-info', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminServerInfo(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/relays/list',
		endpointHandler(deps, 'admin/relays/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminRelaysList(deps, body)),
		),
	);

	app.post(
		'/admin/relays/add',
		endpointHandler(deps, 'admin/relays/add', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminRelaysAdd(deps, body)),
		),
	);

	app.post(
		'/admin/relays/remove',
		endpointHandler(deps, 'admin/relays/remove', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminRelaysRemove(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/federation/update-instance',
		endpointHandler(deps, 'admin/federation/update-instance', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminFederationUpdateInstance(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/federation/refresh-remote-instance-metadata',
		endpointHandler(deps, 'admin/federation/refresh-remote-instance-metadata', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminFederationRefreshRemoteInstanceMetadata(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/federation/remove-all-following',
		endpointHandler(deps, 'admin/federation/remove-all-following', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminFederationRemoveAllFollowing(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/federation/delete-all-files',
		endpointHandler(deps, 'admin/federation/delete-all-files', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminFederationDeleteAllFiles(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/drive/clean-remote-files',
		endpointHandler(deps, 'admin/drive/clean-remote-files', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminDriveCleanRemoteFiles(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/drive/cleanup',
		endpointHandler(deps, 'admin/drive/cleanup', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminDriveCleanup(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/delete-all-files-of-a-user',
		endpointHandler(deps, 'admin/delete-all-files-of-a-user', async ({ body, auth, c }) => {
			await assertHonoApiAdmin(deps, auth);

			await handleHonoApiAdminDeleteAllFilesOfAUser(deps, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/drive/files',
		endpointHandler(deps, 'admin/drive/files', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminDriveFiles(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/drive/show-file',
		endpointHandler(deps, 'admin/drive/show-file', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminDriveShowFile(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/promo/create',
		endpointHandler(deps, 'admin/promo/create', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminPromoCreate(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/reset-password',
		endpointHandler(deps, 'admin/reset-password', async ({ body, auth, c }) =>
			jsonResponse(c, await handleHonoApiAdminResetPassword(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/unset-mfa',
		endpointHandler(deps, 'admin/unset-mfa', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminUnsetMfa(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/unset-user-avatar',
		endpointHandler(deps, 'admin/unset-user-avatar', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminUnsetUserAvatar(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/unset-user-banner',
		endpointHandler(deps, 'admin/unset-user-banner', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminUnsetUserBanner(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/update-user-note',
		endpointHandler(deps, 'admin/update-user-note', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminUpdateUserNote(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/suspend-user',
		endpointHandler(deps, 'admin/suspend-user', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminSuspendUser(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/unsuspend-user',
		endpointHandler(deps, 'admin/unsuspend-user', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminUnsuspendUser(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/send-email',
		endpointHandler(deps, 'admin/send-email', async ({ body, auth, c }) => {
			await assertHonoApiModerator(deps, auth);

			await handleHonoApiAdminSendEmail(deps, body);
			return emptyResponse(c);
		}),
	);
}
