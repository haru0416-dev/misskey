/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isShallow, watch } from 'vue';
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

	test('uses shallow reactivity by default', async () => {
		misskeyApiMock.mockResolvedValueOnce([item('b'), item('a')]);
		const paginator = createPaginator();

		await paginator.init();

		expect(isShallow(paginator.items)).toBe(true);
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

	test('finds cursor extremes without sorting the collection', async () => {
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
		paginator.canFetchOlder.value = true;
		idReads = 0;
		const sort = vi.spyOn(Array.prototype, 'sort');
		misskeyApiMock.mockResolvedValueOnce([]);

		await paginator.fetchOlder();

		expect(misskeyApiMock.mock.calls[0]?.[1]).toMatchObject({ untilId: '0001' });
		expect(idReads).toBeLessThanOrEqual(1000);
		expect(sort).not.toHaveBeenCalled();
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
});
