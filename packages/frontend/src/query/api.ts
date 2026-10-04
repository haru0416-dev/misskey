/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
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

const MUTATION_INVALIDATIONS: readonly {
	mutations: Readonly<Partial<Record<keyof Misskey.Endpoints, true>>> | 'admin/emoji/';
	targets: readonly (keyof Misskey.Endpoints)[];
	scope: 'account' | 'allAccounts';
}[] = [
	{
		mutations: {
			'admin/suspend-user': true,
			'admin/unsuspend-user': true,
			'admin/unset-user-avatar': true,
			'admin/unset-user-banner': true,
			'blocking/create': true,
			'blocking/delete': true,
			'following/create': true,
			'following/delete': true,
			'following/invalidate': true,
			'following/requests/accept': true,
			'following/requests/cancel': true,
			'following/requests/reject': true,
			'following/update': true,
			'i/update': true,
			'mute/create': true,
			'mute/delete': true,
			'renote-mute/create': true,
			'renote-mute/delete': true,
			'users/update-memo': true,
		},
		targets: ['users/show'],
		scope: 'account',
	},
	{ mutations: 'admin/emoji/', targets: ['emoji', 'emojis'], scope: 'allAccounts' },
	{
		mutations: {
			'clips/add-note': true,
			'clips/create': true,
			'clips/delete': true,
			'clips/favorite': true,
			'clips/remove-note': true,
			'clips/unfavorite': true,
			'clips/update': true,
		},
		targets: ['clips/list'],
		scope: 'account',
	},
	{
		mutations: {
			'admin/roles/assign': true,
			'admin/roles/create': true,
			'admin/roles/delete': true,
			'admin/roles/unassign': true,
			'admin/roles/update': true,
			'admin/roles/update-default-policies': true,
		},
		targets: ['admin/roles/list'],
		scope: 'account',
	},
	{
		mutations: {
			'users/lists/create': true,
			'users/lists/create-from-public': true,
			'users/lists/delete': true,
			'users/lists/favorite': true,
			'users/lists/pull': true,
			'users/lists/push': true,
			'users/lists/unfavorite': true,
			'users/lists/update': true,
			'users/lists/update-membership': true,
		},
		targets: ['users/lists/list'],
		scope: 'account',
	},
	{
		mutations: {
			'antennas/create': true,
			'antennas/delete': true,
			'antennas/remove-note': true,
			'antennas/update': true,
		},
		targets: ['antennas/list'],
		scope: 'account',
	},
	{
		mutations: { 'channels/favorite': true, 'channels/unfavorite': true },
		targets: ['channels/my-favorites'],
		scope: 'account',
	},
];

export function invalidateAfterMutation(
	accountId: QueryAccountId | undefined,
	endpoint: keyof Misskey.Endpoints,
): void {
	for (const rule of MUTATION_INVALIDATIONS) {
		const matches =
			typeof rule.mutations === 'string' ? endpoint.startsWith(rule.mutations) : rule.mutations[endpoint] === true;
		if (!matches) continue;
		for (const target of rule.targets) {
			if (rule.scope === 'allAccounts') {
				void queryClient.invalidateQueries({ predicate: (query) => isEndpointQuery(query.queryKey, target) });
			} else if (accountId !== undefined) {
				void queryClient.invalidateQueries({ queryKey: queryKeys.endpointRoot(accountId, target) });
			}
		}
	}
}
