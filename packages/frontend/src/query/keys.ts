/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import type { QueryKey } from '@tanstack/vue-query';
import { host } from '@shared/utility/config.js';

export type QueryAccountId = string | null;

export const queryKeys = {
	all: ['misskey', host] as const,
	account: (accountId: QueryAccountId) => [...queryKeys.all, accountId ?? 'anonymous'] as const,
	endpoints: (accountId: QueryAccountId) => [...queryKeys.account(accountId), 'endpoint'] as const,
	endpointRoot: <E extends keyof Misskey.Endpoints>(accountId: QueryAccountId, endpoint: E) =>
		[...queryKeys.endpoints(accountId), endpoint] as const,
	endpoint: <E extends keyof Misskey.Endpoints>(
		accountId: QueryAccountId,
		endpoint: E,
		params: Misskey.Endpoints[E]['req'],
	) => [...queryKeys.endpointRoot(accountId, endpoint), params] as const,
	mutation: <E extends keyof Misskey.Endpoints>(accountId: QueryAccountId, endpoint: E) =>
		[...queryKeys.account(accountId), 'mutation', endpoint] as const,
};

export function isEndpointQuery<E extends keyof Misskey.Endpoints>(queryKey: QueryKey, endpoint: E): boolean {
	return (
		queryKey[0] === queryKeys.all[0] &&
		queryKey[1] === queryKeys.all[1] &&
		queryKey[3] === 'endpoint' &&
		queryKey[4] === endpoint
	);
}
