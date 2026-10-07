/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, render } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';
import type { entities } from 'misskey-js';
import type { Component } from 'vue';
import type { IPaginator } from '@/utility/paginator.js';

const { api, disposeConnection } = vi.hoisted(() => ({ api: vi.fn(), disposeConnection: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/store.js', () => ({ store: { realtimeMode: true } }));
vi.mock('@/stream.js', () => ({
	useStream: () => ({ useChannel: () => ({ on: vi.fn(), dispose: disposeConnection }) }),
}));
vi.mock('@/os.js', () => ({ contextMenu: vi.fn(), popup: vi.fn() }));
vi.mock('@/features/notification/components/MkNotification.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/features/note/components/MkNote.vue', () => ({ default: { template: '<div />' } }));

import MkPagination from '@/components/layout/MkPagination.vue';
import MkStreamingNotificationsTimeline from '@/features/notification/components/MkStreamingNotificationsTimeline.vue';
import { Paginator } from '@/utility/paginator.js';

// generic SFC の生成された必須 slot context は Vue の components 型と一致しないため、同じ実コンポーネントの props 契約を指定する。
const Pagination: Component<{ paginator: IPaginator; pullToRefresh?: boolean }> = MkPagination as unknown as Component<{
	paginator: IPaginator;
	pullToRefresh?: boolean;
}>;

const requests: { signal: AbortSignal; resolve: (items: entities.Note[]) => void }[] = [];

async function flush() {
	for (let i = 0; i < 8; i++) await nextTick();
}

beforeEach(() => {
	requests.length = 0;
	api.mockReset();
	disposeConnection.mockReset();
	api.mockImplementation((_endpoint: string, _data: unknown, _token: unknown, signal: AbortSignal) => {
		const pending = Promise.withResolvers<entities.Note[]>();
		requests.push({ signal, resolve: pending.resolve });
		signal.addEventListener('abort', () => pending.reject(new DOMException('Aborted', 'AbortError')), { once: true });
		return pending.promise;
	});
});
afterEach(cleanup);

describe('terminal paginator owner cleanup', () => {
	test('KeepAlive deactivation preserves a request, but destruction aborts it and makes the paginator terminal', async () => {
		const paginator = new Paginator('notes/timeline', {});
		const active = ref(true);
		const host = defineComponent({
			components: { MkPagination: Pagination },
			setup: () => ({ active, paginator }),
			template:
				'<KeepAlive><MkPagination v-if="active" :paginator="paginator" :pullToRefresh="false" /><span v-else>other</span></KeepAlive>',
		});
		const view = render(host, { global: { stubs: { MkLoading: true } } });
		const pending = requests[0]!;
		active.value = false;
		await flush();
		expect(pending.signal.aborted).toBe(false);
		view.unmount();
		await flush();
		expect(pending.signal.aborted).toBe(true);
		pending.resolve([]);
		await flush();
		await paginator.reload();
		expect(requests).toHaveLength(1);
		expect(paginator.items.value).toEqual([]);
	});

	test('pagination destruction cancels an older page rather than waiting for eventual settlement', async () => {
		const paginator = new Paginator('notes/timeline', {});
		const view = render(MkPagination, {
			props: { paginator, pullToRefresh: false },
			global: { stubs: { MkLoading: true } },
		});
		// 空の一覧では古い側の取得を開始しないため、表示項目を用意する。
		requests[0]!.resolve([{ id: '001', createdAt: new Date().toISOString() } as entities.Note]);
		await flush();
		paginator.canFetchOlder.value = true;
		const fetching = paginator.fetchOlder();
		expect(requests).toHaveLength(2);
		const page = requests.at(-1)!;
		view.unmount();
		await fetching;
		expect(page.signal.aborted).toBe(true);
		expect(paginator.fetchingOlder.value).toBe(false);
		expect(paginator.olderFailure.value).toBeNull();
	});

	test('notifications destruction aborts initialization independently of the channel connection', async () => {
		const view = render(MkStreamingNotificationsTimeline, { global: { stubs: { MkLoading: true } } });
		const pending = requests[0]!;
		view.unmount();
		await flush();
		expect(pending.signal.aborted).toBe(true);
		expect(disposeConnection).toHaveBeenCalledOnce();
		pending.resolve([]);
		await flush();
		expect(requests).toHaveLength(1);
	});
});
