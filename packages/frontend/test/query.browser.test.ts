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

	test('refreshes user queries only for the account that performed the mutation', async () => {
		let name = 'Before';
		const read = (accountId: string | null, userId: string) =>
			fetchMisskeyQuery({
				accountId,
				endpoint: 'users/show',
				params: { userId },
				queryFn: async () => ({ id: userId, name }),
			});
		await read('account-a', 'user-a');
		await read('account-a', 'user-b');
		await read('account-b', 'user-a');
		await read(null, 'user-a');
		name = 'After';
		invalidateAfterMutation('account-a', 'i/update');

		expect((await read('account-a', 'user-a')).name).toBe('After');
		expect((await read('account-a', 'user-b')).name).toBe('After');
		expect((await read('account-b', 'user-a')).name).toBe('Before');
		expect((await read(null, 'user-a')).name).toBe('Before');
	});

	test('does not invalidate account queries for an unidentified credential owner', () => {
		const key = queryKeys.endpoint('account-a', 'users/show', { userId: 'user-a' });
		queryClient.setQueryData(key, { id: 'user-a', name: 'Before' });
		invalidateAfterMutation(undefined, 'i/update');
		expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
	});

	test('invalidates emoji data across accounts without invalidating unrelated profiles', () => {
		const accounts = ['account-a', 'account-b', null];
		for (const account of accounts) {
			queryClient.setQueryData(queryKeys.endpoint(account, 'emoji', { name: 'blobcat' }), { name: 'blobcat' });
			queryClient.setQueryData(queryKeys.endpoint(account, 'emojis', {}), { emojis: [] });
			queryClient.setQueryData(queryKeys.endpoint(account, 'users/show', { userId: 'user-a' }), { id: 'user-a' });
		}
		invalidateAfterMutation(undefined, 'admin/emoji/update');

		for (const account of accounts) {
			expect(queryClient.getQueryState(queryKeys.endpoint(account, 'emoji', { name: 'blobcat' }))?.isInvalidated).toBe(
				true,
			);
			expect(queryClient.getQueryState(queryKeys.endpoint(account, 'emojis', {}))?.isInvalidated).toBe(true);
			expect(
				queryClient.getQueryState(queryKeys.endpoint(account, 'users/show', { userId: 'user-a' }))?.isInvalidated,
			).toBe(false);
		}
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

test('clearing queries removes projected account data and follows a later replacement query', () => {
	const key = queryKeys.endpoint('account-a', 'users/lists/list', {});
	const view = new QueryCacheView<{ id: string }[]>(key);
	try {
		queryClient.setQueryData(key, [{ id: 'before-signout' }]);
		expect(view.value.value).toEqual([{ id: 'before-signout' }]);
		queryClient.clear();
		expect(view.value.value).toBeUndefined();
		queryClient.setQueryData(key, [{ id: 'new-session' }]);
		expect(view.value.value).toEqual([{ id: 'new-session' }]);
	} finally {
		view.dispose();
		queryClient.clear();
	}
});

describe('query read/write ordering', () => {
	afterEach(() => {
		queryClient.clear();
	});

	test('refreshes an already displayed list when a mutation completes', async () => {
		let rows = [{ id: 'before' }];
		const cache = new QueryBackedCache(
			queryKeys.endpoint('account-a', 'users/lists/list', {}),
			async () => rows,
			60_000,
		);
		try {
			await cache.fetch();
			rows = [{ id: 'before' }, { id: 'created' }];
			invalidateAfterMutation('account-a', 'users/lists/create');
			await expect(cache.fetch()).resolves.toEqual(rows);
			expect(cache.value.value).toEqual(rows);
		} finally {
			cache.dispose();
		}
	});

	test('replaces a cold pending list read and ignores its eventual obsolete response', async () => {
		const old = Promise.withResolvers<{ id: string }[]>();
		const current = [{ id: 'created' }];
		let calls = 0;
		const cache = new QueryBackedCache(
			queryKeys.endpoint('account-a', 'users/lists/list', {}),
			async () => (++calls === 1 ? old.promise : current),
			60_000,
		);
		try {
			const obsolete = cache.fetch().then(
				() => 'completed',
				() => 'cancelled',
			);
			invalidateAfterMutation('account-a', 'users/lists/create');
			await expect(cache.fetch()).resolves.toEqual(current);
			old.resolve([{ id: 'before' }]);
			expect(await obsolete).toBe('cancelled');
			await old.promise;
			expect(cache.value.value).toEqual(current);
			expect(await cache.fetch()).toEqual(current);
			expect(calls).toBe(2);
		} finally {
			cache.dispose();
		}
	});

	test('keeps an inactive pending read invalidated until a fresh read succeeds', async () => {
		const key = queryKeys.endpoint('account-a', 'users/show', { userId: 'user-a' });
		const old = Promise.withResolvers<{ id: string; name: string }>();
		const obsolete = fetchMisskeyQuery({
			accountId: 'account-a',
			endpoint: 'users/show',
			params: { userId: 'user-a' },
			queryFn: () => old.promise,
		}).then(
			() => 'completed',
			() => 'cancelled',
		);
		invalidateAfterMutation('account-a', 'i/update');
		old.resolve({ id: 'user-a', name: 'Before' });
		expect(await obsolete).toBe('cancelled');
		expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
		expect(
			await fetchMisskeyQuery({
				accountId: 'account-a',
				endpoint: 'users/show',
				params: { userId: 'user-a' },
				queryFn: async () => ({ id: 'user-a', name: 'After' }),
			}),
		).toEqual({ id: 'user-a', name: 'After' });
	});

	test('applies ordered stream patches to a cold in-flight user response', async () => {
		const held = Promise.withResolvers<{ id: string; name: string; description: string }>();
		const read = fetchMisskeyQuery({
			accountId: 'account-a',
			endpoint: 'users/show',
			params: { userId: 'user-a' },
			queryFn: () => held.promise,
		});
		updateUserQueries('account-a', { id: 'user-a', name: 'First' });
		updateUserQueries('account-a', { id: 'user-a', name: 'Latest' });
		held.resolve({ id: 'user-a', name: 'Before', description: 'Retained' });
		await expect(read).resolves.toEqual({ id: 'user-a', name: 'Latest', description: 'Retained' });
	});

	test('applies add/update/delete emoji events to an in-flight snapshot in delivery order', async () => {
		const original = { name: 'original', aliases: [], category: null, url: 'before' };
		const added = { name: 'added', aliases: [], category: 'cats', url: 'added' };
		const held = Promise.withResolvers<{ emojis: (typeof original)[] }>();
		const read = fetchMisskeyQuery({
			accountId: null,
			endpoint: 'emojis',
			params: {},
			queryFn: () => held.promise,
		});
		updateEmojiQueries({ type: 'add', emoji: added });
		updateEmojiQueries({ type: 'update', emojis: [{ ...original, url: 'after' }] });
		updateEmojiQueries({ type: 'delete', emojis: [added] });
		held.resolve({ emojis: [original] });
		await expect(read).resolves.toEqual({ emojis: [{ ...original, url: 'after' }] });
	});

	test('a stream patch does not clear an outstanding mutation invalidation', () => {
		const key = queryKeys.endpoint('account-a', 'users/show', { userId: 'user-a' });
		queryClient.setQueryData(key, { id: 'user-a', name: 'Before' });
		invalidateAfterMutation('account-a', 'i/update');
		updateUserQueries('account-a', { id: 'user-a', name: 'After' });
		expect(queryClient.getQueryData(key)).toEqual({ id: 'user-a', name: 'After' });
		expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
	});

	test('view fetches return initial and refresh failures as error state without discarding rows', async () => {
		const failure = new TypeError('offline');
		let offline = true;
		const cache = new QueryBackedCache(
			queryKeys.endpoint('account-a', 'antennas/list', { limit: 30 }),
			async () => {
				if (offline) throw failure;
				return [{ id: 'antenna-a' }];
			},
			60_000,
		);
		try {
			expect(await cache.fetchResult()).toMatchObject({ isError: true, error: failure, data: undefined });
			expect(cache.isError.value).toBe(true);
			offline = false;
			expect(await cache.fetchResult()).toMatchObject({ isSuccess: true, data: [{ id: 'antenna-a' }] });
			offline = true;
			cache.delete();
			expect(await cache.fetchResult()).toMatchObject({ isError: true, error: failure, data: [{ id: 'antenna-a' }] });
			expect(cache.value.value).toEqual([{ id: 'antenna-a' }]);
		} finally {
			cache.dispose();
		}
	});
});

test('an emoji add already included in a pending snapshot is not duplicated during replay', async () => {
	const emoji = { name: 'created', aliases: [], category: null, url: 'current' };
	const held = Promise.withResolvers<{ emojis: (typeof emoji)[] }>();
	const read = fetchMisskeyQuery({
		accountId: null,
		endpoint: 'emojis',
		params: {},
		queryFn: () => held.promise,
	});
	try {
		updateEmojiQueries({ type: 'add', emoji });
		held.resolve({ emojis: [emoji] });
		await expect(read).resolves.toEqual({ emojis: [emoji] });
	} finally {
		queryClient.clear();
	}
});
