/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as iContracts } from '@/server/api/metas/i.js';
import { pickContracts } from '../endpoint-contract.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import { handleApiIMove } from '../account/account-move.js';
import { handleApiIPin, handleApiIUnpin } from '../account/account-pin.js';
import {
	handleApiIChangePassword,
	handleApiIDeleteAccount,
	handleApiIRegenerateToken,
	handleApiIUpdateEmail,
} from '../account/account-security.js';
import { handleApiIUpdate } from '../account/account-update.js';
import {
	handleApiI2faDone,
	handleApiI2faKeyDone,
	handleApiI2faPasswordLess,
	handleApiI2faRegister,
	handleApiI2faRegisterKey,
	handleApiI2faRemoveKey,
	handleApiI2faUnregister,
	handleApiI2faUpdateKey,
} from '../account/i-2fa.js';
import { handleApiISigninHistory } from '../account/i.js';
import { handleApiIReadAnnouncement } from '../announcement/announcements.js';
import { handleApiIApps, handleApiIRevokeToken } from '../auth/access-tokens.js';
import { handleApiIFavorites } from '../favorite/favorites.js';
import { handleApiIGalleryLikes, handleApiIGalleryPosts } from '../gallery/gallery.js';
import {
	handleApiIImportBlocking,
	handleApiIImportFollowing,
	handleApiIImportMuting,
	handleApiIImportUserLists,
} from '../job/import-jobs.js';
import { handleApiIClaimAchievement } from '../notification/notification.js';
import { handleApiINotifications, handleApiINotificationsGrouped } from '../notification/notifications-list.js';
import { handleApiIPageLikes, handleApiIPages } from '../page/pages.js';
import {
	handleApiRegistryGet,
	handleApiRegistryGetAll,
	handleApiRegistryGetDetail,
	handleApiRegistryKeys,
	handleApiRegistryKeysWithType,
	handleApiRegistryRemove,
	handleApiRegistryScopesWithDomain,
	handleApiRegistrySet,
} from '../registry/registry.js';
import {
	handleApiIWebhooksDelete,
	handleApiIWebhooksList,
	handleApiIWebhooksShow,
	handleApiIWebhooksTest,
	handleApiIWebhooksUpdate,
} from '../webhook/webhooks.js';

export const iEndpoints = implementEndpoints<ApiShellDependencies>()(
	pickContracts(iContracts, [
		'i/2fa/done',
		'i/2fa/key-done',
		'i/2fa/password-less',
		'i/2fa/register',
		'i/2fa/register-key',
		'i/2fa/remove-key',
		'i/2fa/unregister',
		'i/2fa/update-key',
		'i/apps',
		'i/change-password',
		'i/claim-achievement',
		'i/delete-account',
		'i/favorites',
		'i/gallery/likes',
		'i/gallery/posts',
		'i/import-blocking',
		'i/import-following',
		'i/import-muting',
		'i/import-user-lists',
		'i/move',
		'i/notifications',
		'i/notifications-grouped',
		'i/page-likes',
		'i/pages',
		'i/pin',
		'i/read-announcement',
		'i/regenerate-token',
		'i/registry/get',
		'i/registry/get-all',
		'i/registry/get-detail',
		'i/registry/keys',
		'i/registry/keys-with-type',
		'i/registry/remove',
		'i/registry/scopes-with-domain',
		'i/registry/set',
		'i/revoke-token',
		'i/signin-history',
		'i/unpin',
		'i/update',
		'i/update-email',
		'i/webhooks/delete',
		'i/webhooks/list',
		'i/webhooks/show',
		'i/webhooks/test',
		'i/webhooks/update',
	]),
	{
		'i/2fa/done': async ({ deps, input, me }) => await handleApiI2faDone(deps, me, input),
		'i/2fa/key-done': async ({ deps, input, me }) => await handleApiI2faKeyDone(deps, me, input),
		'i/2fa/password-less': async ({ deps, input, me }) => {
			await handleApiI2faPasswordLess(deps, me, input);
		},
		'i/2fa/register': async ({ deps, input, me }) => await handleApiI2faRegister(deps, me, input),
		'i/2fa/register-key': async ({ deps, errors, input, me }) =>
			await handleApiI2faRegisterKey(deps, me, input, errors),
		'i/2fa/remove-key': async ({ deps, input, me }) => await handleApiI2faRemoveKey(deps, me, input),
		'i/2fa/unregister': async ({ deps, input, me }) => {
			await handleApiI2faUnregister(deps, me, input);
		},
		'i/2fa/update-key': async ({ deps, input, me }) => await handleApiI2faUpdateKey(deps, me, input),
		'i/apps': async ({ deps, input, me }) => await handleApiIApps(deps, me, input),
		'i/change-password': async ({ deps, input, me }) => {
			await handleApiIChangePassword(deps, me, input);
		},
		'i/claim-achievement': async ({ deps, input, me }) => {
			await handleApiIClaimAchievement(deps, me, input);
		},
		'i/delete-account': async ({ deps, input, me }) => {
			await handleApiIDeleteAccount(deps, me, input);
		},
		'i/favorites': async ({ deps, input, me }) => await handleApiIFavorites(deps, me, input),
		'i/gallery/likes': async ({ deps, input, me }) => await handleApiIGalleryLikes(deps, me, input),
		'i/gallery/posts': async ({ deps, input, me }) => await handleApiIGalleryPosts(deps, me, input),
		'i/import-blocking': async ({ deps, input, me }) => {
			await handleApiIImportBlocking(deps, me, input);
		},
		'i/import-following': async ({ deps, input, me }) => {
			await handleApiIImportFollowing(deps, me, input);
		},
		'i/import-muting': async ({ deps, input, me }) => {
			await handleApiIImportMuting(deps, me, input);
		},
		'i/import-user-lists': async ({ deps, input, me }) => {
			await handleApiIImportUserLists(deps, me, input);
		},
		'i/move': async ({ deps, errors, input, me }) => await handleApiIMove(deps, me, input, errors),
		'i/notifications': async ({ deps, input, me }) => await handleApiINotifications(deps, me, input),
		'i/notifications-grouped': async ({ deps, input, me }) => await handleApiINotificationsGrouped(deps, me, input),
		'i/page-likes': async ({ deps, input, me }) => await handleApiIPageLikes(deps, me, input),
		'i/pages': async ({ deps, input, me }) => await handleApiIPages(deps, me, input),
		'i/pin': async ({ deps, input, me }) => await handleApiIPin(deps, me, input),
		'i/read-announcement': async ({ deps, input, me }) => {
			await handleApiIReadAnnouncement(deps, me, input);
		},
		'i/regenerate-token': async ({ deps, input, me }) => {
			await handleApiIRegenerateToken(deps, me, input);
		},
		'i/registry/get': async ({ auth, deps, errors, input, me }) =>
			await handleApiRegistryGet(deps, me, auth.token, input, errors),
		'i/registry/get-all': async ({ auth, deps, input, me }) =>
			await handleApiRegistryGetAll(deps, me, auth.token, input),
		'i/registry/get-detail': async ({ auth, deps, errors, input, me }) =>
			await handleApiRegistryGetDetail(deps, me, auth.token, input, errors),
		'i/registry/keys': async ({ auth, deps, input, me }) => await handleApiRegistryKeys(deps, me, auth.token, input),
		'i/registry/keys-with-type': async ({ auth, deps, input, me }) =>
			await handleApiRegistryKeysWithType(deps, me, auth.token, input),
		'i/registry/remove': async ({ auth, deps, input, me }) => {
			await handleApiRegistryRemove(deps, me, auth.token, input);
		},
		'i/registry/scopes-with-domain': async ({ deps, me }) => await handleApiRegistryScopesWithDomain(deps, me),
		'i/registry/set': async ({ auth, deps, input, me }) => {
			await handleApiRegistrySet(deps, me, auth.token, input);
		},
		'i/revoke-token': async ({ auth, deps, input, me }) => {
			await handleApiIRevokeToken(deps, me, auth.token, input);
		},
		'i/signin-history': async ({ deps, input, me }) => await handleApiISigninHistory(deps, me, input),
		'i/unpin': async ({ deps, input, me }) => await handleApiIUnpin(deps, me, input),
		'i/update': async ({ auth, deps, errors, input, me }) =>
			await handleApiIUpdate(deps, me, auth.token, input, errors),
		'i/update-email': async ({ deps, errors, input, me }) => await handleApiIUpdateEmail(deps, me, input, errors),
		'i/webhooks/delete': async ({ deps, input, me }) => {
			await handleApiIWebhooksDelete(deps, me, input);
		},
		'i/webhooks/list': async ({ deps, me }) => await handleApiIWebhooksList(deps, me),
		'i/webhooks/show': async ({ deps, input, me }) => await handleApiIWebhooksShow(deps, me, input),
		'i/webhooks/test': async ({ deps, input, me }) => {
			await handleApiIWebhooksTest(deps, me, input);
		},
		'i/webhooks/update': async ({ deps, input, me }) => {
			await handleApiIWebhooksUpdate(deps, me, input);
		},
	},
);
