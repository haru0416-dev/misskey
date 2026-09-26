/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as adminContracts } from '@/server/api/metas/admin.js';
import { pickContracts } from '../endpoint-contract.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiAdminFederationDeleteAllFiles,
	handleApiAdminFederationRefreshRemoteInstanceMetadata,
	handleApiAdminFederationRemoveAllFollowing,
	handleApiAdminFederationUpdateInstance,
} from '../activitypub/federation.js';
import {
	handleApiAdminAbuseUserReports,
	handleApiAdminForwardAbuseUserReport,
	handleApiAdminResolveAbuseUserReport,
	handleApiAdminUpdateAbuseUserReport,
} from '../admin/admin-abuse-reports.js';
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
import { handleApiAdminDeleteAllFilesOfAUser, handleApiAdminDriveFiles } from '../admin/admin-drive.js';
import { handleApiAdminSendEmail } from '../admin/admin-email.js';
import {
	handleApiAdminRelaysAdd,
	handleApiAdminRelaysList,
	handleApiAdminRelaysRemove,
} from '../admin/admin-relays.js';
import { handleApiAdminServerInfo } from '../admin/admin-server-info.js';
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
import { handleApiAdminShowModerationLogs } from '../admin/moderation-log.js';
import { handleApiAdminCaptchaCurrent, handleApiAdminCaptchaSave } from '../captcha/captcha.js';
import { handleApiAdminInviteCreate, handleApiAdminInviteList } from '../invite/invite.js';
import { handleApiAdminPromoCreate } from '../note/promo.js';

export const adminEndpoints = implementEndpoints<ApiShellDependencies>()(
	pickContracts(adminContracts, [
		'admin/abuse-user-reports',
		'admin/accounts/create',
		'admin/accounts/delete',
		'admin/accounts/find-by-email',
		'admin/ad/create',
		'admin/ad/delete',
		'admin/ad/list',
		'admin/ad/update',
		'admin/announcements/create',
		'admin/announcements/delete',
		'admin/announcements/list',
		'admin/announcements/update',
		'admin/avatar-decorations/create',
		'admin/avatar-decorations/delete',
		'admin/avatar-decorations/list',
		'admin/avatar-decorations/update',
		'admin/captcha/current',
		'admin/captcha/save',
		'admin/delete-account',
		'admin/delete-all-files-of-a-user',
		'admin/drive/files',
		'admin/federation/delete-all-files',
		'admin/federation/refresh-remote-instance-metadata',
		'admin/federation/remove-all-following',
		'admin/federation/update-instance',
		'admin/forward-abuse-user-report',
		'admin/get-user-ips',
		'admin/invite/create',
		'admin/invite/list',
		'admin/promo/create',
		'admin/relays/add',
		'admin/relays/list',
		'admin/relays/remove',
		'admin/reset-password',
		'admin/resolve-abuse-user-report',
		'admin/send-email',
		'admin/server-info',
		'admin/show-moderation-logs',
		'admin/show-user',
		'admin/show-users',
		'admin/suspend-user',
		'admin/unset-mfa',
		'admin/unset-user-avatar',
		'admin/unset-user-banner',
		'admin/unsuspend-user',
		'admin/update-abuse-user-report',
		'admin/update-proxy-account',
		'admin/update-user-note',
	]),
	{
		'admin/abuse-user-reports': async ({ deps, input }) => await handleApiAdminAbuseUserReports(deps, input),
		'admin/accounts/create': async ({ auth, deps, input }) => await handleApiAdminAccountsCreate(deps, auth, input),
		'admin/accounts/delete': async ({ deps, input, me }) => {
			await handleApiAdminAccountsDelete(deps, me, input);
		},
		'admin/accounts/find-by-email': async ({ deps, errors, input }) =>
			await handleApiAdminAccountsFindByEmail(deps, input, errors),
		'admin/ad/create': async ({ deps, input, me }) => await handleApiAdminAdCreate(deps, me, input),
		'admin/ad/delete': async ({ deps, input, me }) => {
			await handleApiAdminAdDelete(deps, me, input);
		},
		'admin/ad/list': async ({ deps, input }) => await handleApiAdminAdList(deps, input),
		'admin/ad/update': async ({ deps, input, me }) => {
			await handleApiAdminAdUpdate(deps, me, input);
		},
		'admin/announcements/create': async ({ deps, input, me }) =>
			await handleApiAdminAnnouncementsCreate(deps, me, input),
		'admin/announcements/delete': async ({ deps, input, me }) => {
			await handleApiAdminAnnouncementsDelete(deps, me, input);
		},
		'admin/announcements/list': async ({ deps, input }) => await handleApiAdminAnnouncementsList(deps, input),
		'admin/announcements/update': async ({ deps, input, me }) => {
			await handleApiAdminAnnouncementsUpdate(deps, me, input);
		},
		'admin/avatar-decorations/create': async ({ deps, input, me }) =>
			await handleApiAdminAvatarDecorationsCreate(deps, me, input),
		'admin/avatar-decorations/delete': async ({ deps, input, me }) => {
			await handleApiAdminAvatarDecorationsDelete(deps, me, input);
		},
		'admin/avatar-decorations/list': async ({ deps }) => await handleApiAdminAvatarDecorationsList(deps),
		'admin/avatar-decorations/update': async ({ deps, input, me }) => {
			await handleApiAdminAvatarDecorationsUpdate(deps, me, input);
		},
		'admin/captcha/current': async ({ deps }) => await handleApiAdminCaptchaCurrent(deps),
		'admin/captcha/save': async ({ deps, input }) => {
			await handleApiAdminCaptchaSave(deps, input);
		},
		'admin/delete-account': async ({ deps, input, me }) => {
			await handleApiAdminDeleteAccount(deps, me, input);
		},
		'admin/delete-all-files-of-a-user': async ({ deps, input }) => {
			await handleApiAdminDeleteAllFilesOfAUser(deps, input);
		},
		'admin/drive/files': async ({ deps, input }) => await handleApiAdminDriveFiles(deps, input),
		'admin/federation/delete-all-files': async ({ deps, input }) => {
			await handleApiAdminFederationDeleteAllFiles(deps, input);
		},
		'admin/federation/refresh-remote-instance-metadata': async ({ deps, input }) => {
			await handleApiAdminFederationRefreshRemoteInstanceMetadata(deps, input);
		},
		'admin/federation/remove-all-following': async ({ deps, input }) => {
			await handleApiAdminFederationRemoveAllFollowing(deps, input);
		},
		'admin/federation/update-instance': async ({ deps, input, me }) => {
			await handleApiAdminFederationUpdateInstance(deps, me, input);
		},
		'admin/forward-abuse-user-report': async ({ deps, input, me }) => {
			await handleApiAdminForwardAbuseUserReport(deps, me, input);
		},
		'admin/get-user-ips': async ({ deps, input }) => await handleApiAdminGetUserIps(deps, input),
		'admin/invite/create': async ({ deps, errors, input, me }) =>
			await handleApiAdminInviteCreate(deps, me, input, errors),
		'admin/invite/list': async ({ deps, input }) => await handleApiAdminInviteList(deps, input),
		'admin/promo/create': async ({ deps, errors, input }) => {
			await handleApiAdminPromoCreate(deps, input, errors);
		},
		'admin/relays/add': async ({ deps, input }) => await handleApiAdminRelaysAdd(deps, input),
		'admin/relays/list': async ({ deps }) => await handleApiAdminRelaysList(deps),
		'admin/relays/remove': async ({ deps, input }) => {
			await handleApiAdminRelaysRemove(deps, input);
		},
		'admin/reset-password': async ({ deps, errors, input, me }) =>
			await handleApiAdminResetPassword(deps, me, input, errors),
		'admin/resolve-abuse-user-report': async ({ deps, input, me }) => {
			await handleApiAdminResolveAbuseUserReport(deps, me, input);
		},
		'admin/send-email': async ({ deps, input }) => {
			await handleApiAdminSendEmail(deps, input);
		},
		'admin/server-info': async ({ deps }) => await handleApiAdminServerInfo(deps),
		'admin/show-moderation-logs': async ({ deps, input }) => await handleApiAdminShowModerationLogs(deps, input),
		'admin/show-user': async ({ deps, input, me }) => await handleApiAdminShowUser(deps, me, input),
		'admin/show-users': async ({ deps, input, me }) => await handleApiAdminShowUsers(deps, me, input),
		'admin/suspend-user': async ({ deps, input, me }) => {
			await handleApiAdminSuspendUser(deps, me, input);
		},
		'admin/unset-mfa': async ({ deps, errors, input, me }) => {
			await handleApiAdminUnsetMfa(deps, me, input, errors);
		},
		'admin/unset-user-avatar': async ({ deps, input, me }) => {
			await handleApiAdminUnsetUserAvatar(deps, me, input);
		},
		'admin/unset-user-banner': async ({ deps, input, me }) => {
			await handleApiAdminUnsetUserBanner(deps, me, input);
		},
		'admin/unsuspend-user': async ({ deps, input, me }) => {
			await handleApiAdminUnsuspendUser(deps, me, input);
		},
		'admin/update-abuse-user-report': async ({ deps, input, me }) => {
			await handleApiAdminUpdateAbuseUserReport(deps, me, input);
		},
		'admin/update-proxy-account': async ({ deps, input, me }) =>
			await handleApiAdminUpdateProxyAccount(deps, me, input),
		'admin/update-user-note': async ({ deps, input, me }) => {
			await handleApiAdminUpdateUserNote(deps, me, input);
		},
	},
);
