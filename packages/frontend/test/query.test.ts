/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { QueryBackedCache, QueryCacheView } from '@/query/cache.js';
import { queryClient } from '@/query/client.js';
import { fetchMisskeyQuery, invalidateAfterMutation } from '@/query/api.js';
import { queryKeys } from '@/query/keys.js';
import { updateEmojiQueries, updateUserQueries } from '@/query/streaming.js';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';

describe('TanStack Query integration', () => {
	beforeEach(() => {
		queryClient.clear();
	});

	afterEach(() => {
		queryClient.clear();
		vi.restoreAllMocks();
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
				([url, init]) =>
					String(url).endsWith('/users/show') &&
					new Headers(init?.headers).get('Authorization') === 'Bearer another-account-token' &&
					!String(init?.body).includes('another-account-token'),
			),
		).toHaveLength(2);
	});

	test('keeps anonymous GET credentials out of the URL and query key', async () => {
		const fetch = vi.spyOn(window, 'fetch').mockResolvedValue({
			status: 200,
			json: async () => ({ emojis: [] }),
		} as Response);
		await misskeyApiGet('emojis', { i: 'must-not-be-sent' });
		expect(fetch.mock.calls.some(([url]) => String(url).includes('must-not-be-sent'))).toBe(false);
		expect(queryClient.getQueryData(queryKeys.endpoint(null, 'emojis', {}))).toEqual({ emojis: [] });
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
		cache.dispose();
	});

	test('projects hydrated and fetched data until its subscription is disposed', () => {
		const key = queryKeys.endpoint(null, 'emojis', {});
		const initial = { emojis: [{ name: 'cached' }] };
		const fetched = { emojis: [{ name: 'fetched' }] };
		const view = new QueryCacheView(key, { initialData: initial, updatedAt: 100 });
		expect(view.value.value).toEqual(initial);
		queryClient.setQueryData(key, fetched);
		expect(view.value.value).toEqual(fetched);
		view.dispose();
		queryClient.setQueryData(key, initial);
		expect(view.value.value).toEqual(fetched);
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
		queryClient.setQueryData(
			listKey,
			{ emojis: [{ name: 'blobcat', aliases: [], category: null, url: '' }] },
			{ updatedAt: 100 },
		);
		queryClient.setQueryData(detailKey, { name: 'blobcat' });

		updateEmojiQueries({
			type: 'update',
			emojis: [{ name: 'blobcat', aliases: ['cat'], category: null, url: 'updated' }],
		});

		expect(queryClient.getQueryData<{ emojis: { url: string }[] }>(listKey)?.emojis[0]?.url).toBe('updated');
		expect(queryClient.getQueryState(detailKey)?.isInvalidated).toBe(true);
		expect(queryClient.getQueryState(listKey)?.dataUpdatedAt).toBe(100);
	});
});
