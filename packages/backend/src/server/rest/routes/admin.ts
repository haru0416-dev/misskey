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
	authenticateApiToken,
} from '../auth/auth.js';
import {
	handleApiAdminAbuseUserReports,
	handleApiAdminForwardAbuseUserReport,
	handleApiAdminResolveAbuseUserReport,
	handleApiAdminUpdateAbuseUserReport,
} from '../admin/admin-abuse-reports.js';
import {
	handleApiAdminAbuseReportNotificationRecipientCreate,
	handleApiAdminAbuseReportNotificationRecipientDelete,
	handleApiAdminAbuseReportNotificationRecipientList,
	handleApiAdminAbuseReportNotificationRecipientShow,
	handleApiAdminAbuseReportNotificationRecipientUpdate,
} from '../admin/admin-abuse-report-notification-recipient.js';
import {
	handleApiAdminAccountsCreate,
	handleApiAdminAccountsDelete,
	handleApiAdminAccountsFindByEmail,
	handleApiAdminDeleteAccount,
	handleApiAdminUpdateProxyAccount,
} from '../admin/admin-accounts.js';
import {
	handleApiAdminAdCreate,
	handleApiAdminAdDelete,
	handleApiAdminAdList,
	handleApiAdminAdUpdate,
} from '../admin/admin-ad.js';
import {
	handleApiAdminAnnouncementsCreate,
	handleApiAdminAnnouncementsDelete,
	handleApiAdminAnnouncementsList,
	handleApiAdminAnnouncementsUpdate,
} from '../admin/admin-announcements.js';
import {
	handleApiAdminAvatarDecorationsCreate,
	handleApiAdminAvatarDecorationsDelete,
	handleApiAdminAvatarDecorationsList,
	handleApiAdminAvatarDecorationsUpdate,
} from '../admin/admin-avatar-decorations.js';
import {
	handleApiAdminRelaysAdd,
	handleApiAdminRelaysList,
	handleApiAdminRelaysRemove,
} from '../admin/admin-relays.js';
import {
	handleApiAdminRolesAssign,
	handleApiAdminRolesCreate,
	handleApiAdminRolesDelete,
	handleApiAdminRolesList,
	handleApiAdminRolesShow,
	handleApiAdminRolesUnassign,
	handleApiAdminRolesUpdate,
	handleApiAdminRolesUpdateDefaultPolicies,
	handleApiAdminRolesUsers,
} from '../admin/admin-roles.js';
import { handleApiAdminSendEmail } from '../admin/admin-email.js';
import { handleApiAdminServerInfo } from '../admin/admin-server-info.js';
import {
	handleApiAdminSystemWebhookCreate,
	handleApiAdminSystemWebhookDelete,
	handleApiAdminSystemWebhookList,
	handleApiAdminSystemWebhookShow,
	handleApiAdminSystemWebhookTest,
	handleApiAdminSystemWebhookUpdate,
} from '../admin/admin-system-webhooks.js';
import { handleApiAdminGetUserIps } from '../admin/admin-user-ips.js';
import {
	handleApiAdminResetPassword,
	handleApiAdminUnsetMfa,
	handleApiAdminUnsetUserAvatar,
	handleApiAdminUnsetUserBanner,
	handleApiAdminUpdateUserNote,
} from '../admin/admin-user-maintenance.js';
import { handleApiAdminSuspendUser, handleApiAdminUnsuspendUser } from '../admin/admin-user-suspension.js';
import { handleApiAdminShowUser, handleApiAdminShowUsers } from '../admin/admin-users.js';
import {
	handleApiAdminFederationDeleteAllFiles,
	handleApiAdminFederationRefreshRemoteInstanceMetadata,
	handleApiAdminFederationRemoveAllFollowing,
	handleApiAdminFederationUpdateInstance,
} from '../activitypub/federation.js';
import {
	handleApiAdminDeleteAllFilesOfAUser,
	handleApiAdminDriveCleanRemoteFiles,
	handleApiAdminDriveCleanup,
	handleApiAdminDriveFiles,
	handleApiAdminDriveShowFile,
} from '../admin/admin-drive.js';
import { handleApiAdminInviteCreate, handleApiAdminInviteList } from '../invite/invite.js';
import { handleApiAdminMeta, handleApiAdminUpdateMeta } from '../meta/meta.js';
import { handleApiAdminShowModerationLogs } from '../admin/moderation-log.js';
import { handleApiAdminPromoCreate } from '../note/promo.js';
import { assertApiRateLimitForUser } from '../rate-limit.js';
import {
	jsonResponse,
	emptyResponse,
	jsonBody,
	tokenFromRequest,
	runApiEndpoint,
	assertApiModerator,
	assertApiAdmin,
	assertApiCanManageAvatarDecorations,
} from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';
import { endpointHandler, endpointHandlerAnonymous } from '../endpoint-handlers.js';

export function registerAdminRoutes(app: Hono, deps: ApiShellDependencies): void {
	app.post(
		'/admin/accounts/create',
		endpointHandlerAnonymous(deps, 'admin/accounts/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAccountsCreate(deps, auth, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/accounts/find-by-email',
		endpointHandler(deps, 'admin/accounts/find-by-email', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAccountsFindByEmail(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/meta',
		endpointHandler(deps, 'admin/meta', async ({ body, auth, c }) => jsonResponse(c, await handleApiAdminMeta(deps))),
	);

	app.post(
		'/admin/update-meta',
		endpointHandler(deps, 'admin/update-meta', async ({ body, auth, c }) => {
			await assertApiAdmin(deps, auth);

			await handleApiAdminUpdateMeta(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/update-proxy-account',
		endpointHandler(deps, 'admin/update-proxy-account', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminUpdateProxyAccount(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/accounts/delete',
		endpointHandler(deps, 'admin/accounts/delete', async ({ body, auth, c }) => {
			await assertApiAdmin(deps, auth);

			await handleApiAdminAccountsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/delete-account',
		endpointHandler(deps, 'admin/delete-account', async ({ body, auth, c }) => {
			await assertApiAdmin(deps, auth);

			await handleApiAdminDeleteAccount(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/abuse-report/notification-recipient/create',
		endpointHandler(deps, 'admin/abuse-report/notification-recipient/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAbuseReportNotificationRecipientCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/abuse-report/notification-recipient/delete',
		endpointHandler(deps, 'admin/abuse-report/notification-recipient/delete', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminAbuseReportNotificationRecipientDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/abuse-report/notification-recipient/list',
		endpointHandler(deps, 'admin/abuse-report/notification-recipient/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAbuseReportNotificationRecipientList(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/abuse-report/notification-recipient/show',
		endpointHandler(deps, 'admin/abuse-report/notification-recipient/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAbuseReportNotificationRecipientShow(deps, body)),
		),
	);

	app.post(
		'/admin/abuse-report/notification-recipient/update',
		endpointHandler(deps, 'admin/abuse-report/notification-recipient/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAbuseReportNotificationRecipientUpdate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/resolve-abuse-user-report',
		endpointHandler(deps, 'admin/resolve-abuse-user-report', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminResolveAbuseUserReport(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/forward-abuse-user-report',
		endpointHandler(deps, 'admin/forward-abuse-user-report', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminForwardAbuseUserReport(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/abuse-user-reports',
		endpointHandler(deps, 'admin/abuse-user-reports', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAbuseUserReports(deps, body)),
		),
	);

	app.post(
		'/admin/update-abuse-user-report',
		endpointHandler(deps, 'admin/update-abuse-user-report', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminUpdateAbuseUserReport(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/ad/create',
		endpointHandler(deps, 'admin/ad/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAdCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/ad/delete',
		endpointHandler(deps, 'admin/ad/delete', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:ad');

			await handleApiAdminAdDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/ad/list',
		endpointHandler(deps, 'admin/ad/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAdList(deps, body)),
		),
	);

	app.post(
		'/admin/ad/update',
		endpointHandler(deps, 'admin/ad/update', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:ad');

			await handleApiAdminAdUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/announcements/create',
		endpointHandler(deps, 'admin/announcements/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAnnouncementsCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/announcements/delete',
		endpointHandler(deps, 'admin/announcements/delete', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:announcements');

			await handleApiAdminAnnouncementsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/announcements/list',
		endpointHandler(deps, 'admin/announcements/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAnnouncementsList(deps, body)),
		),
	);

	app.post(
		'/admin/announcements/update',
		endpointHandler(deps, 'admin/announcements/update', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);
			assertTokenPermission(auth, 'write:admin:announcements');

			await handleApiAdminAnnouncementsUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/avatar-decorations/create',
		endpointHandler(deps, 'admin/avatar-decorations/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAvatarDecorationsCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/avatar-decorations/delete',
		endpointHandler(deps, 'admin/avatar-decorations/delete', async ({ body, auth, c }) => {
			await handleApiAdminAvatarDecorationsDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/avatar-decorations/list',
		endpointHandler(deps, 'admin/avatar-decorations/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminAvatarDecorationsList(deps, body)),
		),
	);

	app.post(
		'/admin/avatar-decorations/update',
		endpointHandler(deps, 'admin/avatar-decorations/update', async ({ body, auth, c }) => {
			await handleApiAdminAvatarDecorationsUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/invite/create',
		endpointHandler(deps, 'admin/invite/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminInviteCreate(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/invite/list',
		endpointHandler(deps, 'admin/invite/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminInviteList(deps, body)),
		),
	);

	app.post(
		'/admin/roles/assign',
		endpointHandler(deps, 'admin/roles/assign', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminRolesAssign(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/roles/create',
		endpointHandler(deps, 'admin/roles/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminRolesCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/roles/delete',
		endpointHandler(deps, 'admin/roles/delete', async ({ body, auth, c }) => {
			await assertApiAdmin(deps, auth);

			await handleApiAdminRolesDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/roles/list',
		endpointHandler(deps, 'admin/roles/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminRolesList(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/roles/show',
		endpointHandler(deps, 'admin/roles/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminRolesShow(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/roles/users',
		endpointHandler(deps, 'admin/roles/users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminRolesUsers(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/roles/unassign',
		endpointHandler(deps, 'admin/roles/unassign', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminRolesUnassign(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/roles/update',
		endpointHandler(deps, 'admin/roles/update', async ({ body, auth, c }) => {
			await assertApiAdmin(deps, auth);

			await handleApiAdminRolesUpdate(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/roles/update-default-policies',
		endpointHandler(deps, 'admin/roles/update-default-policies', async ({ body, auth, c }) => {
			await assertApiAdmin(deps, auth);

			await handleApiAdminRolesUpdateDefaultPolicies(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/system-webhook/create',
		endpointHandler(deps, 'admin/system-webhook/create', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminSystemWebhookCreate(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/system-webhook/delete',
		endpointHandler(deps, 'admin/system-webhook/delete', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminSystemWebhookDelete(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/system-webhook/list',
		endpointHandler(deps, 'admin/system-webhook/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminSystemWebhookList(deps, body)),
		),
	);

	app.post(
		'/admin/system-webhook/show',
		endpointHandler(deps, 'admin/system-webhook/show', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminSystemWebhookShow(deps, body)),
		),
	);

	app.post(
		'/admin/system-webhook/test',
		endpointHandler(deps, 'admin/system-webhook/test', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);
			// 外部 URL への HTTP 配送をキューに積むので、無制限だと増幅送信の踏み台になる

			await handleApiAdminSystemWebhookTest(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/system-webhook/update',
		endpointHandler(deps, 'admin/system-webhook/update', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminSystemWebhookUpdate(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/show-moderation-logs',
		endpointHandler(deps, 'admin/show-moderation-logs', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminShowModerationLogs(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/get-user-ips',
		endpointHandler(deps, 'admin/get-user-ips', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminGetUserIps(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/show-user',
		endpointHandler(deps, 'admin/show-user', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminShowUser(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/show-users',
		endpointHandler(deps, 'admin/show-users', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminShowUsers(deps, auth.user, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/server-info',
		endpointHandler(deps, 'admin/server-info', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminServerInfo(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/relays/list',
		endpointHandler(deps, 'admin/relays/list', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminRelaysList(deps, body)),
		),
	);

	app.post(
		'/admin/relays/add',
		endpointHandler(deps, 'admin/relays/add', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminRelaysAdd(deps, body)),
		),
	);

	app.post(
		'/admin/relays/remove',
		endpointHandler(deps, 'admin/relays/remove', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminRelaysRemove(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/federation/update-instance',
		endpointHandler(deps, 'admin/federation/update-instance', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminFederationUpdateInstance(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/federation/refresh-remote-instance-metadata',
		endpointHandler(deps, 'admin/federation/refresh-remote-instance-metadata', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminFederationRefreshRemoteInstanceMetadata(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/federation/remove-all-following',
		endpointHandler(deps, 'admin/federation/remove-all-following', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminFederationRemoveAllFollowing(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/federation/delete-all-files',
		endpointHandler(deps, 'admin/federation/delete-all-files', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminFederationDeleteAllFiles(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/drive/clean-remote-files',
		endpointHandler(deps, 'admin/drive/clean-remote-files', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminDriveCleanRemoteFiles(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/drive/cleanup',
		endpointHandler(deps, 'admin/drive/cleanup', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminDriveCleanup(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/delete-all-files-of-a-user',
		endpointHandler(deps, 'admin/delete-all-files-of-a-user', async ({ body, auth, c }) => {
			await assertApiAdmin(deps, auth);

			await handleApiAdminDeleteAllFilesOfAUser(deps, body);
			return emptyResponse(c);
		}),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/drive/files',
		endpointHandler(deps, 'admin/drive/files', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminDriveFiles(deps, body)),
		),
	);

	app.on(
		['POST', 'QUERY'],
		'/admin/drive/show-file',
		endpointHandler(deps, 'admin/drive/show-file', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminDriveShowFile(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/promo/create',
		endpointHandler(deps, 'admin/promo/create', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminPromoCreate(deps, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/reset-password',
		endpointHandler(deps, 'admin/reset-password', async ({ body, auth, c }) =>
			jsonResponse(c, await handleApiAdminResetPassword(deps, auth.user, body)),
		),
	);

	app.post(
		'/admin/unset-mfa',
		endpointHandler(deps, 'admin/unset-mfa', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminUnsetMfa(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/unset-user-avatar',
		endpointHandler(deps, 'admin/unset-user-avatar', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminUnsetUserAvatar(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/unset-user-banner',
		endpointHandler(deps, 'admin/unset-user-banner', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminUnsetUserBanner(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/update-user-note',
		endpointHandler(deps, 'admin/update-user-note', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminUpdateUserNote(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/suspend-user',
		endpointHandler(deps, 'admin/suspend-user', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminSuspendUser(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/unsuspend-user',
		endpointHandler(deps, 'admin/unsuspend-user', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminUnsuspendUser(deps, auth.user, body);
			return emptyResponse(c);
		}),
	);

	app.post(
		'/admin/send-email',
		endpointHandler(deps, 'admin/send-email', async ({ body, auth, c }) => {
			await assertApiModerator(deps, auth);

			await handleApiAdminSendEmail(deps, body);
			return emptyResponse(c);
		}),
	);
}
