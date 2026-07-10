/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { MutationObserver } from '@tanstack/vue-query';
import type { QueryAccountId } from '@/query/keys.js';
import { queryClient } from '@/query/client.js';
import { queryKeys } from '@/query/keys.js';

export function executeMisskeyMutation<E extends keyof Misskey.Endpoints, T>(options: {
	accountId: QueryAccountId;
	endpoint: E;
	mutationFn: () => Promise<T>;
}): Promise<T> {
	const observer = new MutationObserver<T, unknown, void>(queryClient, {
		mutationKey: queryKeys.mutation(options.accountId, options.endpoint),
		mutationFn: options.mutationFn,
	});
	return observer.mutate();
}
