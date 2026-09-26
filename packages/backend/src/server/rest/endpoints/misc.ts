/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as miscContracts } from '@/server/api/metas/misc.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiBlockingCreate,
	handleApiBlockingDelete,
	handleApiBlockingList,
} from '../account/account-blocking.js';
import {
	handleApiMuteCreate,
	handleApiMuteDelete,
	handleApiMuteList,
	handleApiRenoteMuteCreate,
	handleApiRenoteMuteDelete,
	handleApiRenoteMuteList,
} from '../account/account-mutes.js';
import { handleApiApGet, handleApiApShow } from '../activitypub/ap.js';
import { handleApiFetchExternalResources } from '../activitypub/fetch-external-resources.js';
import { handleApiResetDb } from '../admin/reset-db.js';
import {
	handleApiAnnouncementReact,
	handleApiAnnouncementShow,
	handleApiAnnouncementUnreact,
	handleApiAnnouncements,
} from '../announcement/announcements.js';
import {
	handleApiEmailAddressAvailable,
	handleApiGetOnlineUsersCount,
	handleApiUsernameAvailable,
} from '../auth/availability.js';
import { handleApiMiauthGenToken } from '../auth/miauth.js';
import { handleApiRequestResetPassword, handleApiResetPassword } from '../auth/password-reset.js';
import { handleApiGetAvatarDecorations } from '../avatar-decoration/avatar-decorations.js';
import { handleApiEndpoint, handleApiEndpoints } from '../endpoint-info.js';
import {
	handleApiInviteCreate,
	handleApiInviteDelete,
	handleApiInviteLimit,
	handleApiInviteList,
} from '../invite/invite.js';
import { handleApiMeta, handleApiPing, handleApiServerInfo, handleApiTest } from '../meta/meta.js';
import { handleApiPromoRead } from '../note/promo.js';
import {
	handleApiNotificationsCreate,
	handleApiNotificationsDelete,
	handleApiNotificationsFlush,
	handleApiNotificationsMarkAllAsRead,
	handleApiNotificationsTestNotification,
} from '../notification/notification.js';
import {
	handleApiSwRegister,
	handleApiSwShowRegistration,
	handleApiSwUnregister,
	handleApiSwUpdateRegistration,
} from '../notification/sw.js';
import { handleApiPagePush } from '../page/page-push.js';
import { handleApiRolesList, handleApiRolesNotes, handleApiRolesShow, handleApiRolesUsers } from '../role/roles.js';
import { handleApiPinnedUsers } from '../user/user.js';
import { handleApiStats } from '../chart/charts.js';
import { handleApiEmoji, handleApiEmojis, handleApiV2AdminEmojiList } from '../emoji/emojis.js';
import { handleApiRetention } from '../retention/retention.js';
import { handleApiExportCustomEmojis } from '../job/export-jobs.js';
import { handleApiFetchRss } from '../feed/fetch-rss.js';
import { handleApiVerifyEmail } from '../auth/verify-email.js';
import { getApiRolePolicies } from '../role/role-policy.js';
import { rolePermissionDeniedError } from '../error.js';

export const miscEndpoints = implementEndpoints<ApiShellDependencies>()(miscContracts, {
	announcements: async ({ deps, input, me }) => await handleApiAnnouncements(deps, me, input),
	'announcements/show': async ({ deps, errors, input, me }) => await handleApiAnnouncementShow(deps, me, input, errors),
	'announcements/react': async ({ deps, errors, input, me }) => {
		await handleApiAnnouncementReact(deps, me, input, errors);
	},
	'announcements/unreact': async ({ deps, errors, input, me }) => {
		await handleApiAnnouncementUnreact(deps, me, input, errors);
	},
	'ap/show': async ({ deps, errors, input, me }) => await handleApiApShow(deps, me, input, errors),
	'blocking/create': async ({ deps, input, me }) => await handleApiBlockingCreate(deps, me, input),
	'blocking/delete': async ({ deps, input, me }) => await handleApiBlockingDelete(deps, me, input),
	'blocking/list': async ({ deps, input, me }) => await handleApiBlockingList(deps, me, input),
	'email-address/available': async ({ deps, input }) => await handleApiEmailAddressAvailable(deps, input),
	endpoint: async ({ input }) => await handleApiEndpoint(input),
	'fetch-external-resources': async ({ deps, input, me }) => await handleApiFetchExternalResources(deps, me, input),
	'get-avatar-decorations': async ({ deps }) => await handleApiGetAvatarDecorations(deps),
	'invite/delete': async ({ deps, errors, input, me }) => {
		await handleApiInviteDelete(deps, me, input, errors);
	},
	'invite/list': async ({ deps, input, me }) => await handleApiInviteList(deps, me, input),
	meta: async ({ deps, input }) => await handleApiMeta(deps, input),
	'miauth/gen-token': async ({ deps, input, me }) => await handleApiMiauthGenToken(deps, me, input),
	'mute/create': async ({ deps, input, me }) => {
		await handleApiMuteCreate(deps, me, input);
	},
	'mute/list': async ({ deps, input, me }) => await handleApiMuteList(deps, me, input),
	'notifications/create': async ({ auth, deps, input, me }) => {
		await handleApiNotificationsCreate(deps, me, auth.token, input);
	},
	'notifications/delete': async ({ deps, input, me }) => {
		await handleApiNotificationsDelete(deps, me, input);
	},
	'page-push': async ({ deps, errors, input, me }) => {
		await handleApiPagePush(deps, me, input, errors);
	},
	'pinned-users': async ({ deps, me }) => await handleApiPinnedUsers(deps, me),
	'promo/read': async ({ deps, errors, input, me }) => {
		await handleApiPromoRead(deps, me, input, errors);
	},
	'renote-mute/list': async ({ deps, input, me }) => await handleApiRenoteMuteList(deps, me, input),
	'reset-db': async ({ deps, input }) => {
		await handleApiResetDb(deps, input);
	},
	'reset-password': async ({ deps, errors, input }) => {
		await handleApiResetPassword(deps, input, errors);
	},
	'roles/list': async ({ deps }) => await handleApiRolesList(deps),
	'roles/notes': async ({ deps, errors, input, me }) => await handleApiRolesNotes(deps, me, input, errors),
	'roles/show': async ({ deps, errors, input }) => await handleApiRolesShow(deps, input, errors),
	'roles/users': async ({ deps, errors, input, me }) => await handleApiRolesUsers(deps, me, input, errors),
	'sw/register': async ({ deps, input, me }) => await handleApiSwRegister(deps, me, input),
	'sw/show-registration': async ({ deps, input, me }) => await handleApiSwShowRegistration(deps, me, input),
	'sw/unregister': async ({ deps, input, me }) => {
		await handleApiSwUnregister(deps, me, input);
	},
	'sw/update-registration': async ({ deps, input, me }) => await handleApiSwUpdateRegistration(deps, me, input),
	'username/available': async ({ deps, input }) => await handleApiUsernameAvailable(deps, input),
	endpoints: async () => await handleApiEndpoints(),
	'mute/delete': async ({ deps, input, me }) => {
		await handleApiMuteDelete(deps, me, input);
	},
	'renote-mute/create': async ({ deps, input, me }) => {
		await handleApiRenoteMuteCreate(deps, me, input);
	},
	'renote-mute/delete': async ({ deps, input, me }) => {
		await handleApiRenoteMuteDelete(deps, me, input);
	},
	stats: async ({ deps }) => await handleApiStats(deps),
	emoji: async ({ deps, input }) => await handleApiEmoji(deps, input),
	emojis: async ({ deps }) => await handleApiEmojis(deps),
	retention: async ({ deps, input }) => await handleApiRetention(deps, input),
	'server-info': async ({ deps }) => await handleApiServerInfo(deps.meta),
	'get-online-users-count': async ({ deps }) => await handleApiGetOnlineUsersCount(deps),
	ping: async () => handleApiPing(),
	test: async ({ input }) => handleApiTest(input),
	'export-custom-emojis': async ({ deps, me }) => {
		handleApiExportCustomEmojis(deps, me);
	},
	'fetch-rss': async ({ deps, input }) => await handleApiFetchRss(deps, input),
	'ap/get': async ({ deps, input }) => await handleApiApGet(deps, input),
	'invite/create': async ({ deps, me, input }) => {
		const policies = await getApiRolePolicies(deps, me);
		if (!policies.canInvite && deps.meta.rootUserId !== me.id) throw rolePermissionDeniedError();
		return await handleApiInviteCreate(deps, me, policies, input);
	},
	'invite/limit': async ({ deps, me, input }) => {
		const policies = await getApiRolePolicies(deps, me);
		if (!policies.canInvite && deps.meta.rootUserId !== me.id) throw rolePermissionDeniedError();
		return await handleApiInviteLimit(deps, me, policies, input);
	},
	'notifications/flush': async ({ deps, me }) => {
		handleApiNotificationsFlush(deps, me);
	},
	'notifications/mark-all-as-read': async ({ deps, me }) => {
		handleApiNotificationsMarkAllAsRead(deps, me);
	},
	'notifications/test-notification': async ({ deps, me }) => {
		handleApiNotificationsTestNotification(deps, me);
	},
	'request-reset-password': async ({ deps, input }) => {
		await handleApiRequestResetPassword(deps, input);
	},
	'verify-email': async ({ deps, input }) => {
		await handleApiVerifyEmail(deps, input);
	},
	'v2/admin/emoji/list': async ({ deps, input }) => await handleApiV2AdminEmojiList(deps, input),
});
