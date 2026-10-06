/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { watch } from 'vue';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { misskeyApiMock } = vi.hoisted(() => ({
	misskeyApiMock: vi.fn(),
}));

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: misskeyApiMock,
}));

import { Paginator } from '@/utility/paginator.js';

function item(id: string, extra: Record<string, unknown> = {}) {
	return { id, ...extra } as any;
}

function createPaginator(props: ConstructorParameters<typeof Paginator<'notes/timeline'>>[1] = {}) {
	return new Paginator('notes/timeline', props);
}

describe('Paginator', () => {
	beforeEach(() => {
		misskeyApiMock.mockReset();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('preserves the initial response order and completes fetching', async () => {
		misskeyApiMock.mockResolvedValueOnce([item('b'), item('a')]);
		const paginator = createPaginator();

		await paginator.init();

		expect(paginator.items.value.map((value) => value.id)).toEqual(['b', 'a']);
		expect(paginator.fetching.value).toBe(false);
	});

	test('deduplicates batches in linear time and notifies once', () => {
		const paginator = createPaginator();
		paginator.fetching.value = false;
		paginator.pushItems([item('a'), item('b'), item('a')]);
		let notifications = 0;
		const stop = watch(paginator.items, () => notifications++, { flush: 'sync' });

		paginator.unshiftItems([item('c'), item('b'), item('c')]);

		expect(paginator.items.value.map((value) => value.id)).toEqual(['c', 'a', 'b']);
		expect(notifications).toBe(1);
		stop();
	});

	test('keeps duplicate detection linear as the item count grows', () => {
		const paginator = createPaginator();
		let existingIdReads = 0;
		const existingItems = Array.from({ length: 500 }, (_, index) => ({
			get id() {
				existingIdReads++;
				return String(index).padStart(4, '0');
			},
		})) as any[];
		paginator.pushItems(existingItems);
		existingIdReads = 0;

		paginator.unshiftItems(Array.from({ length: 500 }, (_, index) => item(String(index).padStart(4, '0'))));

		expect(existingIdReads).toBeLessThanOrEqual(500);
	});

	test('finds cursor extremes in linear time while preserving collection order', async () => {
		const paginator = createPaginator();
		let idReads = 0;
		const items = Array.from({ length: 500 }, (_, index) => ({
			get id() {
				idReads++;
				return String(500 - index).padStart(4, '0');
			},
		})) as any[];
		paginator.pushItems(items);
		paginator.fetching.value = false;
		const expectedOrder = Array.from({ length: 500 }, (_, index) => String(500 - index).padStart(4, '0'));
		expect(paginator.items.value.map((value) => value.id)).toEqual(expectedOrder);
		paginator.canFetchOlder.value = true;
		idReads = 0;
		misskeyApiMock.mockResolvedValueOnce([]);

		await paginator.fetchOlder();

		expect(misskeyApiMock.mock.calls[0]?.[1]).toMatchObject({ untilId: '0001' });
		expect(idReads).toBeLessThanOrEqual(1000);
		expect(paginator.items.value.map((value) => value.id)).toEqual(expectedOrder);
	});

	test('coalesces concurrent newer-page requests', async () => {
		let resolve!: (items: unknown[]) => void;
		misskeyApiMock.mockImplementationOnce(
			() =>
				new Promise((res) => {
					resolve = res;
				}),
		);
		const paginator = createPaginator();
		paginator.pushItems([item('a'), item('c'), item('b')]);
		paginator.fetching.value = false;

		const first = paginator.fetchNewer();
		const second = paginator.fetchNewer();
		resolve([]);
		await Promise.all([first, second]);

		expect(misskeyApiMock).toHaveBeenCalledOnce();
		expect(misskeyApiMock.mock.calls[0]?.[1]).toMatchObject({ sinceId: 'c' });
		expect(misskeyApiMock.mock.calls[0]?.[3]).toBeInstanceOf(AbortSignal);
	});

	test('aborts an obsolete initialization when reloading', async () => {
		let firstSignal: AbortSignal | undefined;
		misskeyApiMock
			.mockImplementationOnce((_endpoint, _data, _token, signal: AbortSignal) => {
				firstSignal = signal;
				return new Promise((_resolve, reject) => {
					signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
				});
			})
			.mockResolvedValueOnce([item('new')]);
		const paginator = createPaginator();

		const obsolete = paginator.init();
		const current = paginator.reload();
		await Promise.all([obsolete, current]);

		expect(firstSignal?.aborted).toBe(true);
		expect(paginator.items.value.map((value) => value.id)).toEqual(['new']);
		expect(paginator.error.value).toBe(false);
	});

	test('updates and removes queued items before release', () => {
		const paginator = createPaginator();
		paginator.enqueue(item('a', { value: 1 }));
		paginator.updateItem('a', (value) => ({ ...value, value: 2 }));
		paginator.releaseQueue();

		expect(paginator.items.value).toEqual([expect.objectContaining({ id: 'a', value: 2 })]);

		paginator.enqueue(item('b'));
		paginator.removeItem('b');
		paginator.releaseQueue();
		expect(paginator.items.value.map((value) => value.id)).toEqual(['a']);
		expect(paginator.queuedAheadItemsCount.value).toBe(0);
	});

	test('uses the configured initial limit for page availability detection', async () => {
		misskeyApiMock.mockResolvedValueOnce([item('a'), item('b')]);
		const paginator = createPaginator({ limit: 2, canFetchDetection: 'limit' });

		await paginator.init();

		expect(paginator.canFetchOlder.value).toBe(true);
	});

	test('offsetMode を関数で渡すと、取得のたびに ID と件数のどちらで続きを取るか決め直す', async () => {
		let useOffset = false;
		misskeyApiMock.mockResolvedValue([item('b'), item('a')]);
		const paginator = createPaginator({ limit: 2, offsetMode: () => useOffset });
		await paginator.init();

		await paginator.fetchOlder();
		expect(misskeyApiMock.mock.lastCall?.[1]).toMatchObject({ untilId: 'a' });
		expect(misskeyApiMock.mock.lastCall?.[1]).not.toHaveProperty('offset');

		useOffset = true;
		await paginator.reload();
		await paginator.fetchOlder();
		expect(misskeyApiMock.mock.lastCall?.[1]).toMatchObject({ offset: 2 });
		expect(misskeyApiMock.mock.lastCall?.[1]).not.toHaveProperty('untilId');
	});

	test('keeps the API error code of a failed load and clears it after a retry succeeds', async () => {
		const paginator = createPaginator();
		misskeyApiMock.mockRejectedValueOnce({ code: 'SEARCH_TIMED_OUT', id: '1667db67-5b25-414d-8138-f9ef15c624c4' });
		await paginator.init();
		expect(paginator.error.value).toBe(true);
		expect(paginator.errorCode.value).toBe('SEARCH_TIMED_OUT');

		misskeyApiMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await paginator.init();
		expect(paginator.errorCode.value).toBeNull();

		misskeyApiMock.mockResolvedValueOnce([item('a')]);
		await paginator.init();
		expect(paginator.error.value).toBe(false);
		expect(paginator.errorCode.value).toBeNull();
	});

	test('records a failed load-more per direction without replacing the list, and clears it on success', async () => {
		const paginator = createPaginator();
		misskeyApiMock.mockResolvedValueOnce([item('c'), item('b')]);
		await paginator.init();
		paginator.canFetchOlder.value = true;

		misskeyApiMock.mockRejectedValueOnce({ code: 'SEARCH_TIMED_OUT' });
		await paginator.fetchOlder();
		expect(paginator.olderFailure.value).toEqual({ code: 'SEARCH_TIMED_OUT' });
		expect(paginator.newerFailure.value).toBeNull();
		expect(paginator.error.value).toBe(false);
		expect(paginator.items.value.map((value) => value.id)).toEqual(['c', 'b']);

		misskeyApiMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await paginator.fetchNewer();
		expect(paginator.newerFailure.value).toEqual({ code: null });

		misskeyApiMock.mockResolvedValueOnce([item('a')]);
		await paginator.fetchOlder();
		expect(paginator.olderFailure.value).toBeNull();
		expect(paginator.items.value.map((value) => value.id)).toEqual(['c', 'b', 'a']);

		// 一覧を取り直すと、取り直しが失敗しても前の続きの失敗は残らない。
		expect(paginator.newerFailure.value).toEqual({ code: null });
		misskeyApiMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
		await paginator.init();
		expect(paginator.newerFailure.value).toBeNull();
		expect(paginator.error.value).toBe(true);
	});
});
