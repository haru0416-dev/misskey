/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { assertCredential, assertOptionalCredential, assertSecureCredential, assertTokenPermission, authenticateHonoApiToken } from '../auth.js';
import { handleHonoApiAdminAbuseUserReports, handleHonoApiAdminForwardAbuseUserReport, handleHonoApiAdminResolveAbuseUserReport, handleHonoApiAdminUpdateAbuseUserReport } from '../admin-abuse-reports.js';
import { handleHonoApiAdminAbuseReportNotificationRecipientCreate, handleHonoApiAdminAbuseReportNotificationRecipientDelete, handleHonoApiAdminAbuseReportNotificationRecipientList, handleHonoApiAdminAbuseReportNotificationRecipientShow, handleHonoApiAdminAbuseReportNotificationRecipientUpdate } from '../admin-abuse-report-notification-recipient.js';
import { handleHonoApiAdminAccountsCreate, handleHonoApiAdminAccountsDelete, handleHonoApiAdminAccountsFindByEmail, handleHonoApiAdminDeleteAccount, handleHonoApiAdminUpdateProxyAccount } from '../admin-accounts.js';
import { handleHonoApiAdminAdCreate, handleHonoApiAdminAdDelete, handleHonoApiAdminAdList, handleHonoApiAdminAdUpdate } from '../admin-ad.js';
import { handleHonoApiAdminAnnouncementsCreate, handleHonoApiAdminAnnouncementsDelete, handleHonoApiAdminAnnouncementsList, handleHonoApiAdminAnnouncementsUpdate } from '../admin-announcements.js';
import { handleHonoApiAdminAvatarDecorationsCreate, handleHonoApiAdminAvatarDecorationsDelete, handleHonoApiAdminAvatarDecorationsList, handleHonoApiAdminAvatarDecorationsUpdate } from '../admin-avatar-decorations.js';
import { handleHonoApiAdminRelaysAdd, handleHonoApiAdminRelaysList, handleHonoApiAdminRelaysRemove } from '../admin-relays.js';
import { handleHonoApiAdminRolesAssign, handleHonoApiAdminRolesCreate, handleHonoApiAdminRolesDelete, handleHonoApiAdminRolesList, handleHonoApiAdminRolesShow, handleHonoApiAdminRolesUnassign, handleHonoApiAdminRolesUpdate, handleHonoApiAdminRolesUpdateDefaultPolicies, handleHonoApiAdminRolesUsers } from '../admin-roles.js';
import { handleHonoApiAdminSendEmail } from '../admin-email.js';
import { handleHonoApiAdminServerInfo } from '../admin-server-info.js';
import { handleHonoApiAdminSystemWebhookCreate, handleHonoApiAdminSystemWebhookDelete, handleHonoApiAdminSystemWebhookList, handleHonoApiAdminSystemWebhookShow, handleHonoApiAdminSystemWebhookTest, handleHonoApiAdminSystemWebhookUpdate } from '../admin-system-webhooks.js';
import { handleHonoApiAdminGetUserIps } from '../admin-user-ips.js';
import { handleHonoApiAdminResetPassword, handleHonoApiAdminUnsetMfa, handleHonoApiAdminUnsetUserAvatar, handleHonoApiAdminUnsetUserBanner, handleHonoApiAdminUpdateUserNote } from '../admin-user-maintenance.js';
import { handleHonoApiAdminSuspendUser, handleHonoApiAdminUnsuspendUser } from '../admin-user-suspension.js';
import { handleHonoApiAdminShowUser, handleHonoApiAdminShowUsers } from '../admin-users.js';
import { handleHonoApiAdminFederationDeleteAllFiles, handleHonoApiAdminFederationRefreshRemoteInstanceMetadata, handleHonoApiAdminFederationRemoveAllFollowing, handleHonoApiAdminFederationUpdateInstance } from '../federation.js';
import { handleHonoApiAdminDeleteAllFilesOfAUser, handleHonoApiAdminDriveCleanRemoteFiles, handleHonoApiAdminDriveCleanup, handleHonoApiAdminDriveFiles, handleHonoApiAdminDriveShowFile } from '../admin-drive.js';
import { handleHonoApiAdminInviteCreate, handleHonoApiAdminInviteList } from '../invite.js';
import { handleHonoApiAdminMeta, handleHonoApiAdminUpdateMeta } from '../meta.js';
import { handleHonoApiAdminShowModerationLogs } from '../moderation-log.js';
import { handleHonoApiAdminPromoCreate } from '../promo.js';
import { jsonResponse, emptyResponse, jsonBody, tokenFromRequest, runApiEndpoint, assertHonoApiModerator, assertHonoApiAdmin, assertHonoApiCanManageAvatarDecorations } from '../shell-helpers.js';
import type { ApiShellDependencies } from '../shell.js';

export function registerAdminRoutes(app: Hono, deps: ApiShellDependencies): void {
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

			return jsonResponse(c, await handleHonoApiAdminRolesUsers(deps, auth.user, body));
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
}
