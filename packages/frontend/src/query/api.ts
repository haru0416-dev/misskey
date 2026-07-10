/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import type { QueryAccountId } from '@/query/keys.js';
import { queryClient } from '@/query/client.js';
import { isEndpointQuery, queryKeys } from '@/query/keys.js';

const QUERY_STALE_TIMES = {
	meta: 1000 * 60 * 60,
	'users/show': 30_000,
	emoji: 1000 * 60 * 5,
	emojis: 1000 * 60 * 60,
} as const satisfies Partial<Record<keyof Misskey.Endpoints, number>>;

type CachedEndpoint = keyof typeof QUERY_STALE_TIMES;

export function isCachedEndpoint(endpoint: keyof Misskey.Endpoints): endpoint is CachedEndpoint {
	return Object.hasOwn(QUERY_STALE_TIMES, endpoint);
}

export function fetchMisskeyQuery<T>(options: {
	accountId: QueryAccountId;
	endpoint: CachedEndpoint;
	params: unknown;
	queryFn: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
	return queryClient.fetchQuery({
		queryKey: [...queryKeys.endpointRoot(options.accountId, options.endpoint), options.params],
		queryFn: ({ signal }) => options.queryFn(signal),
		staleTime: QUERY_STALE_TIMES[options.endpoint],
	});
}

const USER_MUTATIONS = new Set<string>([
	'admin/suspend-user',
	'admin/unsuspend-user',
	'admin/unset-user-avatar',
	'admin/unset-user-banner',
	'blocking/create',
	'blocking/delete',
	'following/create',
	'following/delete',
	'following/invalidate',
	'following/requests/accept',
	'following/requests/cancel',
	'following/requests/reject',
	'following/update',
	'i/update',
	'mute/create',
	'mute/delete',
	'renote-mute/create',
	'renote-mute/delete',
	'users/update-memo',
]);

const CLIP_MUTATIONS = new Set<string>([
	'clips/add-note',
	'clips/create',
	'clips/delete',
	'clips/favorite',
	'clips/remove-note',
	'clips/unfavorite',
	'clips/update',
]);
const ROLE_MUTATIONS = new Set<string>([
	'admin/roles/assign',
	'admin/roles/create',
	'admin/roles/delete',
	'admin/roles/unassign',
	'admin/roles/update',
	'admin/roles/update-default-policies',
]);
const USER_LIST_MUTATIONS = new Set<string>([
	'users/lists/create',
	'users/lists/create-from-public',
	'users/lists/delete',
	'users/lists/favorite',
	'users/lists/pull',
	'users/lists/push',
	'users/lists/unfavorite',
	'users/lists/update',
	'users/lists/update-membership',
]);
const ANTENNA_MUTATIONS = new Set<string>([
	'antennas/create',
	'antennas/delete',
	'antennas/remove-note',
	'antennas/update',
]);

export function invalidateAfterMutation(accountId: QueryAccountId, endpoint: keyof Misskey.Endpoints): void {
	const invalidateEndpoint = <E extends keyof Misskey.Endpoints>(target: E) => {
		void queryClient.invalidateQueries({ queryKey: queryKeys.endpointRoot(accountId, target) });
	};
	const invalidateEndpointForAllAccounts = <E extends keyof Misskey.Endpoints>(target: E) => {
		void queryClient.invalidateQueries({ predicate: (query) => isEndpointQuery(query.queryKey, target) });
	};

	if (USER_MUTATIONS.has(endpoint)) invalidateEndpoint('users/show');
	if (endpoint.startsWith('admin/emoji/')) {
		invalidateEndpointForAllAccounts('emoji');
		invalidateEndpointForAllAccounts('emojis');
	}
	if (CLIP_MUTATIONS.has(endpoint)) invalidateEndpoint('clips/list');
	if (ROLE_MUTATIONS.has(endpoint)) invalidateEndpoint('admin/roles/list');
	if (USER_LIST_MUTATIONS.has(endpoint)) invalidateEndpoint('users/lists/list');
	if (ANTENNA_MUTATIONS.has(endpoint)) invalidateEndpoint('antennas/list');
	if (endpoint === 'channels/favorite' || endpoint === 'channels/unfavorite') {
		invalidateEndpoint('channels/my-favorites');
	}
}
