/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { QueryBackedCache } from '@/query/cache.js';
import { queryClient } from '@/query/client.js';
import { fetchMisskeyQuery, invalidateAfterMutation } from '@/query/api.js';
import { queryKeys } from '@/query/keys.js';
import { updateEmojiQueries, updateUserQueries } from '@/query/streaming.js';
import { executeMisskeyMutation } from '@/query/mutation.js';
import { misskeyApi } from '@/utility/misskey-api.js';

describe('TanStack Query integration', () => {
	beforeEach(() => {
		queryClient.clear();
	});

	afterEach(() => {
		queryClient.clear();
		vi.restoreAllMocks();
	});

	test('builds account-scoped, typed endpoint keys', () => {
		const key = queryKeys.endpoint('account-a', 'users/show', { userId: 'user-a' });

		expect(key.slice(2)).toEqual(['account-a', 'endpoint', 'users/show', { userId: 'user-a' }]);
	});

	test('deduplicates concurrent endpoint queries', async () => {
		let resolve!: (value: { id: string }) => void;
		const request = vi.fn(
			() =>
				new Promise<{ id: string }>((res) => {
					resolve = res;
				}),
		);
		const options = {
			accountId: 'account-a',
			endpoint: 'users/show' as const,
			params: { userId: 'user-a' },
			queryFn: request,
		};

		const first = fetchMisskeyQuery(options);
		const second = fetchMisskeyQuery(options);
		resolve({ id: 'user-a' });

		await expect(Promise.all([first, second])).resolves.toEqual([{ id: 'user-a' }, { id: 'user-a' }]);
		expect(request).toHaveBeenCalledOnce();
	});

	test('routes selected misskeyApi reads through QueryClient', async () => {
		const fetch = vi.spyOn(window, 'fetch').mockResolvedValue({
			status: 200,
			json: async () => ({ id: 'user-a', name: 'User A' }),
		} as Response);

		const first = misskeyApi('users/show', { userId: 'user-a' });
		const second = misskeyApi('users/show', { userId: 'user-a' });

		await expect(Promise.all([first, second])).resolves.toHaveLength(2);
		expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/users/show'))).toHaveLength(1);
	});

	test('does not share explicitly credentialed reads through the active-account cache', async () => {
		const fetch = vi.spyOn(window, 'fetch').mockResolvedValue({
			status: 200,
			json: async () => ({ id: 'user-a' }),
		} as Response);

		await misskeyApi('users/show', { userId: 'user-a' }, 'another-account-token');
		await misskeyApi('users/show', { userId: 'user-a' }, 'another-account-token');

		expect(
			fetch.mock.calls.filter(
				([url, init]) => String(url).endsWith('/users/show') && String(init?.body).includes('another-account-token'),
			),
		).toHaveLength(2);
	});

	test('uses QueryClient as the backing store for shared list caches', async () => {
		const queryKey = queryKeys.endpoint('account-a', 'clips/list', { limit: 30 });
		const request = vi.fn(async () => [{ id: 'clip-a' }]);
		const cache = new QueryBackedCache(queryKey, request, 60_000);

		await expect(cache.fetch()).resolves.toEqual([{ id: 'clip-a' }]);
		await expect(cache.fetch()).resolves.toEqual([{ id: 'clip-a' }]);
		expect(request).toHaveBeenCalledOnce();
		expect(queryClient.getQueryData(queryKey)).toEqual([{ id: 'clip-a' }]);

		cache.set([{ id: 'clip-b' }]);
		expect(cache.value.value).toEqual([{ id: 'clip-b' }]);
	});

	test('invalidates related list queries after mutations', () => {
		const clipsKey = queryKeys.endpoint('account-a', 'clips/list', { limit: 30 });
		const channelsKey = queryKeys.endpoint('account-a', 'channels/my-favorites', { limit: 100 });
		queryClient.setQueryData(clipsKey, [{ id: 'clip-a' }]);
		queryClient.setQueryData(channelsKey, [{ id: 'channel-a' }]);

		invalidateAfterMutation('account-a', 'clips/create');
		invalidateAfterMutation('account-a', 'channels/favorite');

		expect(queryClient.getQueryState(clipsKey)?.isInvalidated).toBe(true);
		expect(queryClient.getQueryState(channelsKey)?.isInvalidated).toBe(true);
	});

	test('registers dialog commands in the TanStack mutation cache', async () => {
		await expect(
			executeMisskeyMutation({
				accountId: 'account-a',
				endpoint: 'clips/create',
				mutationFn: async () => ({ id: 'clip-a' }),
			}),
		).resolves.toEqual({ id: 'clip-a' });

		expect(queryClient.getMutationCache().getAll()).toHaveLength(1);
		expect(queryClient.getMutationCache().getAll()[0]?.options.mutationKey).toEqual(
			queryKeys.mutation('account-a', 'clips/create'),
		);
	});

	test('patches cached users from streaming updates', () => {
		const singleKey = queryKeys.endpoint('account-a', 'users/show', { userId: 'user-a' });
		const bulkKey = queryKeys.endpoint('account-a', 'users/show', { userIds: ['user-a', 'user-b'] });
		queryClient.setQueryData(singleKey, { id: 'user-a', name: 'Before' });
		queryClient.setQueryData(bulkKey, [
			{ id: 'user-a', name: 'Before' },
			{ id: 'user-b', name: 'Other' },
		]);

		updateUserQueries('account-a', { id: 'user-a', name: 'After' });

		expect(queryClient.getQueryData(singleKey)).toMatchObject({ id: 'user-a', name: 'After' });
		expect(queryClient.getQueryData<{ id: string; name: string }[]>(bulkKey)?.[0]).toMatchObject({
			id: 'user-a',
			name: 'After',
		});
	});

	test('patches emoji lists and invalidates emoji details from streaming updates', () => {
		const listKey = queryKeys.endpoint(null, 'emojis', {});
		const detailKey = queryKeys.endpoint(null, 'emoji', { name: 'blobcat' });
		queryClient.setQueryData(listKey, { emojis: [{ name: 'blobcat', aliases: [], category: null, url: '' }] });
		queryClient.setQueryData(detailKey, { name: 'blobcat' });

		updateEmojiQueries({
			type: 'update',
			emojis: [{ name: 'blobcat', aliases: ['cat'], category: null, url: 'updated' }],
		});

		expect(queryClient.getQueryData<{ emojis: { url: string }[] }>(listKey)?.emojis[0]?.url).toBe('updated');
		expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
	});
});
