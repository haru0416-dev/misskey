/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as followingContracts } from '@/server/api/metas/following.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiFollowingCreate,
	handleApiFollowingDelete,
	handleApiFollowingInvalidate,
	handleApiFollowingList,
	handleApiFollowingRequestsAccept,
	handleApiFollowingRequestsCancel,
	handleApiFollowingRequestsList,
	handleApiFollowingRequestsReject,
	handleApiFollowingRequestsSent,
	handleApiFollowingUpdate,
	handleApiFollowingUpdateAll,
} from '../user/following.js';

export const followingEndpoints = implementEndpoints<ApiShellDependencies>()(followingContracts, {
	'following/create': async ({ deps, input, me }) => await handleApiFollowingCreate(deps, me, input),
	'following/delete': async ({ deps, input, me }) => await handleApiFollowingDelete(deps, me, input),
	'following/invalidate': async ({ deps, input, me }) => await handleApiFollowingInvalidate(deps, me, input),
	'following/list': async ({ deps, input, me }) => await handleApiFollowingList(deps, me, input),
	'following/requests/accept': async ({ deps, input, me }) => {
		await handleApiFollowingRequestsAccept(deps, me, input);
	},
	'following/requests/cancel': async ({ deps, input, me }) => await handleApiFollowingRequestsCancel(deps, me, input),
	'following/requests/list': async ({ deps, input, me }) => await handleApiFollowingRequestsList(deps, me, input),
	'following/requests/reject': async ({ deps, input, me }) => {
		await handleApiFollowingRequestsReject(deps, me, input);
	},
	'following/requests/sent': async ({ deps, input, me }) => await handleApiFollowingRequestsSent(deps, me, input),
	'following/update': async ({ deps, input, me }) => await handleApiFollowingUpdate(deps, me, input),
	'following/update-all': async ({ deps, input, me }) => {
		await handleApiFollowingUpdateAll(deps, me, input);
	},
});
