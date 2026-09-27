/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'eventemitter3';
import { defineComponent, h } from 'vue';
import { cleanup, render } from '@testing-library/vue';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type * as Misskey from 'misskey-js';

const stream = Object.assign(new EventEmitter(), { send: vi.fn() });

vi.mock('@/stream.js', () => ({ useStream: () => stream }));
vi.mock('@/i.js', () => ({ $i: { id: 'me' } }));
vi.mock('@/store.js', () => ({ store: { realtimeMode: true } }));

afterEach(() => {
	cleanup();
});

describe('useNoteCapture', () => {
	test('クリック時に始めた購読も、アンマウントで解除する', async () => {
		const { useNoteCapture } = await import('@/features/notes/useNoteCapture.js');
		// 5 分より前の投稿は自動では購読しない。
		const note = {
			id: 'old-note',
			createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
			reactions: {},
			reactionCount: 0,
			reactionEmojis: {},
			myReaction: null,
			poll: null,
		} as unknown as Misskey.entities.Note;

		let subscribeLater: () => void = () => {};
		const Component = defineComponent({
			setup() {
				subscribeLater = useNoteCapture({ note, parentNote: null }).subscribe;
				return () => h('div');
			},
		});
		const { unmount } = render(Component);
		expect(stream.listenerCount('noteUpdated')).toBe(0);

		subscribeLater();
		subscribeLater();
		expect(stream.listenerCount('noteUpdated')).toBe(1);
		expect(stream.send).toHaveBeenCalledWith('sr', { id: 'old-note' });

		unmount();
		expect(stream.listenerCount('noteUpdated')).toBe(0);
		expect(stream.listenerCount('_connected_')).toBe(0);
		expect(stream.send).toHaveBeenCalledWith('un', { id: 'old-note' });
	});
});
