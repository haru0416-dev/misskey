/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineComponent, h, nextTick, watch } from 'vue';
import { cleanup, render } from '@testing-library/vue';
import { afterEach, expect, test, vi } from 'vitest';
import type * as Misskey from 'misskey-js';
import { useStreamingNotesTimeline } from '@/features/note/useStreamingNotesTimeline.js';
import { globalEvents } from '@/events.js';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: api }));
vi.mock('@/store.js', () => ({ store: { realtimeMode: false } }));
vi.mock('@/preferences.js', () => ({ prefer: { pollingInterval: 3 } }));
vi.mock('@/instance.js', () => ({ instance: { notesPerOneAd: 0 } }));
vi.mock('@/i.js', () => ({ $i: { id: 'me' } }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: {} } }));
vi.mock('@/stream.js', () => ({ useStream: vi.fn() }));

afterEach(cleanup);

function note(id: string): Misskey.entities.Note {
	// この境界では投稿の識別と並びだけを表示する。
	return { id, createdAt: new Date().toISOString() } as Misskey.entities.Note;
}

test.each([true, false])('newer timeline backfill uses the current viewport (initial top: %s)', async (initialTop) => {
	vi.useFakeTimers();
	api.mockReset();
	const held = Promise.withResolvers<Misskey.entities.Note[]>();
	const initialized = Promise.withResolvers<void>();
	const backfilled = Promise.withResolvers<void>();
	api.mockResolvedValueOnce([note('001')]).mockReturnValueOnce(held.promise);
	let atTop = initialTop;
	let viewportChanged: (() => void) | undefined;
	const screen = render(
		defineComponent({
			setup() {
				const timeline = useStreamingNotesTimeline(
					{ src: 'home', withRenotes: true, withReplies: true, withSensitive: true, onlyFiles: false },
					{ isAtTop: () => atTop, onBeforePrepend() {}, onNote() {}, onRemove() {}, onQueueReleased() {} },
				);
				viewportChanged = timeline.onViewportChanged;
				watch(
					timeline.paginator.value.fetching,
					(fetching) => {
						if (!fetching) initialized.resolve();
					},
					{ flush: 'sync' },
				);
				watch(
					timeline.paginator.value.fetchingNewer,
					(fetching) => {
						if (!fetching) backfilled.resolve();
					},
					{ flush: 'sync' },
				);
				return () =>
					h(
						'div',
						`${timeline.paginator.value.items.value.map((item) => item.id).join(',')}:${timeline.paginator.value.queuedAheadItemsCount.value}`,
					);
			},
		}),
	);
	try {
		await initialized.promise;
		await nextTick();
		expect(screen.getByText('001:0')).toBeTruthy();
		globalEvents.emit('notePosted', note('002'));
		atTop = !initialTop;
		viewportChanged?.();
		held.resolve([note('002')]);
		await backfilled.promise;
		await nextTick();
		expect(screen.getByText(initialTop ? '001:1' : '002,001:0')).toBeTruthy();
	} finally {
		screen.unmount();
		vi.useRealTimers();
	}
});

test('polling waits a complete interval after a slow page settles, not after its start', async () => {
	vi.useFakeTimers();
	api.mockReset();
	const held = Promise.withResolvers<Misskey.entities.Note[]>();
	const initialized = Promise.withResolvers<void>();
	api
		.mockResolvedValueOnce([note('001')])
		.mockReturnValueOnce(held.promise)
		.mockResolvedValueOnce([note('003')]);
	const screen = render(
		defineComponent({
			setup() {
				const timeline = useStreamingNotesTimeline(
					{ src: 'home', withRenotes: true, withReplies: true, withSensitive: true, onlyFiles: false },
					{ isAtTop: () => true, onBeforePrepend() {}, onNote() {}, onRemove() {}, onQueueReleased() {} },
				);
				watch(
					timeline.paginator.value.fetching,
					(fetching) => {
						if (!fetching) initialized.resolve();
					},
					{ flush: 'sync' },
				);
				return () => h('div', timeline.paginator.value.items.value.map((item) => item.id).join(','));
			},
		}),
	);
	try {
		await initialized.promise;
		await nextTick();
		await vi.advanceTimersByTimeAsync(10_000);
		await vi.advanceTimersByTimeAsync(15_000);
		expect(api).toHaveBeenCalledTimes(2);
		held.resolve([note('002')]);
		await held.promise;
		await nextTick();
		await vi.advanceTimersByTimeAsync(5_000);
		expect(api).toHaveBeenCalledTimes(2);
		await vi.advanceTimersByTimeAsync(5_000);
		expect(screen.getByText('003,002,001')).toBeTruthy();
	} finally {
		screen.unmount();
		vi.useRealTimers();
	}
});
