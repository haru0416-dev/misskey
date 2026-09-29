/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'eventemitter3';
import { defineComponent, h } from 'vue';
import { cleanup, render } from '@testing-library/vue';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type * as Misskey from 'misskey-js';

const stream = Object.assign(new EventEmitter(), { send: vi.fn(), state: 'connected' });

vi.mock('@/stream.js', () => ({ useStream: () => stream }));
vi.mock('@/i.js', () => ({ $i: { id: 'me' } }));
const { storeState } = vi.hoisted(() => ({ storeState: { realtimeMode: true } }));
vi.mock('@/store.js', () => ({ store: storeState }));
const { misskeyApiMock } = vi.hoisted(() => ({ misskeyApiMock: vi.fn() }));
vi.mock('@/utility/misskey-api.js', () => ({ misskeyApi: misskeyApiMock }));
// プラグイン (note_view_interruptor) が入っている状態を作る。
const { pluginState } = vi.hoisted(() => ({
	pluginState: { interrupt: null as ((note: Misskey.entities.Note) => Misskey.entities.Note | null) | null },
}));
vi.mock('@/plugin.js', () => ({
	getPluginHandlers: () => (pluginState.interrupt ? [{}] : []),
	applyNoteViewInterruptors: (note: Misskey.entities.Note) => pluginState.interrupt!(note),
}));

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

	test('未接続の間に始めた購読は、接続したときに 1 回だけ送る (解除 1 回でサーバーに残らない)', async () => {
		const { useNoteCapture } = await import('@/features/notes/useNoteCapture.js');
		const note = {
			id: 'offline-note',
			createdAt: new Date().toISOString(),
			reactions: {},
			reactionCount: 0,
			reactionEmojis: {},
			myReaction: null,
			poll: null,
		} as unknown as Misskey.entities.Note;
		stream.send.mockClear();
		stream.state = 'reconnecting';
		try {
			const { unmount } = render(
				defineComponent({
					setup() {
						useNoteCapture({ note, parentNote: null });
						return () => h('div');
					},
				}),
			);
			expect(stream.send).not.toHaveBeenCalled();
			stream.emit('_connected_');
			expect(stream.send.mock.calls.filter(([type, body]) => type === 'sr' && body.id === 'offline-note')).toHaveLength(
				1,
			);
			unmount();
			expect(stream.send.mock.calls.filter(([type, body]) => type === 'un' && body.id === 'offline-note')).toHaveLength(
				1,
			);
		} finally {
			stream.state = 'connected';
		}
	});

	test('編集の合図を受けたら、同じノートを何か所に出していても 1 回だけ取り直して配る', async () => {
		const { useNoteCapture } = await import('@/features/notes/useNoteCapture.js');
		const { globalEvents } = await import('@/events.js');
		const note = {
			id: 'edited-note',
			createdAt: new Date().toISOString(),
			reactions: {},
			reactionCount: 0,
			reactionEmojis: {},
			myReaction: null,
			poll: null,
		} as unknown as Misskey.entities.Note;
		const fetched = { ...note, text: 'after', updatedAt: '2026-01-02T00:00:00.000Z' };
		misskeyApiMock.mockReset();
		misskeyApiMock.mockResolvedValue(fetched);
		const edited = vi.fn();
		globalEvents.on('noteEdited', edited);

		const Component = defineComponent({
			setup() {
				useNoteCapture({ note, parentNote: null });
				useNoteCapture({ note, parentNote: null });
				return () => h('div');
			},
		});
		render(Component);
		stream.emit('noteUpdated', { id: 'edited-note', type: 'edited', body: { updatedAt: fetched.updatedAt } });
		await vi.waitFor(() => expect(edited).toHaveBeenCalledTimes(1));

		expect(misskeyApiMock).toHaveBeenCalledTimes(1);
		expect(misskeyApiMock).toHaveBeenCalledWith('notes/show', { noteId: 'edited-note' });
		expect(edited).toHaveBeenCalledWith(fetched);
		globalEvents.off('noteEdited', edited);
	});
});

describe('applyEditedNote', () => {
	const base = {
		id: 'n1',
		text: 'before',
		cw: null,
		tags: ['old'],
		fileIds: [],
		files: [],
		visibility: 'public',
		_shouldInsertAd_: true,
	} as unknown as Misskey.entities.Note;
	const edited = {
		id: 'n1',
		text: 'after',
		cw: 'cw',
		fileIds: [],
		files: [],
		visibility: 'home',
		updatedAt: '2026-01-02T00:00:00.000Z',
		reactions: { '👍': 5 },
		reactionCount: 5,
		reactionEmojis: {},
		myReaction: '👍',
	} as unknown as Misskey.entities.Note;

	test('そのノート・リノートの中・返信の中を書き換え、編集で消えた列は消し、一覧の印は残す', async () => {
		const { applyEditedNote } = await import('@/features/notes/useNoteCapture.js');
		const self = applyEditedNote(base, edited) as Misskey.entities.Note & { _shouldInsertAd_?: boolean };
		expect(self).toMatchObject({ text: 'after', cw: 'cw', visibility: 'home', updatedAt: edited.updatedAt });
		expect('tags' in self).toBe(false);
		expect(self._shouldInsertAd_).toBe(true);

		const renote = { id: 'r1', renote: base, text: null } as unknown as Misskey.entities.Note;
		expect(applyEditedNote(renote, edited).renote).toMatchObject({ text: 'after' });
		const reply = { id: 'r2', reply: base, text: 'hi' } as unknown as Misskey.entities.Note;
		expect(applyEditedNote(reply, edited).reply).toMatchObject({ text: 'after' });
	});

	test('関係のない項目は同じ参照のまま返す (一覧を無駄に描き直さない)', async () => {
		const { applyEditedNote } = await import('@/features/notes/useNoteCapture.js');
		const other = { id: 'other', text: 'x' } as unknown as Misskey.entities.Note;
		expect(applyEditedNote(other, edited)).toBe(other);
	});

	test('リアクションは取り直した時点の値にする (描き直しで読み込み時の値に戻さない)', async () => {
		const { applyEditedNote } = await import('@/features/notes/useNoteCapture.js');
		const stale = { ...base, reactions: {}, reactionCount: 0, myReaction: null } as unknown as Misskey.entities.Note;
		expect(applyEditedNote(stale, edited)).toMatchObject({
			reactions: { '👍': 5 },
			reactionCount: 5,
			myReaction: '👍',
		});
	});
});

describe('noteRenderKey', () => {
	const target = { id: 't1', text: 'target', fileIds: [] } as unknown as Misskey.entities.Note;
	const editedTarget = { ...target, updatedAt: '2026-01-02T00:00:00.000Z' } as Misskey.entities.Note;

	test('ノート自身か、単なるリノートのリノート先が編集されたら変わる', async () => {
		const { noteRenderKey } = await import('@/features/notes/useNoteCapture.js');
		expect(noteRenderKey(editedTarget)).not.toBe(noteRenderKey(target));
		const renote = (renoted: Misskey.entities.Note) =>
			({
				id: 'p1',
				text: null,
				cw: null,
				replyId: null,
				poll: null,
				fileIds: [],
				renoteId: 't1',
				renote: renoted,
			}) as unknown as Misskey.entities.Note;
		expect(noteRenderKey(renote(editedTarget))).not.toBe(noteRenderKey(renote(target)));
		// リノート先を取れなかった項目は renote が null で届く。
		expect(() => noteRenderKey(renote(null as unknown as Misskey.entities.Note))).not.toThrow();
	});

	test('引用先・返信先の編集では変わらない (外側のノートの状態を作り直さない)', async () => {
		const { noteRenderKey } = await import('@/features/notes/useNoteCapture.js');
		const quote = (renoted: Misskey.entities.Note) =>
			({ id: 'q1', text: 'quote', fileIds: [], renoteId: 't1', renote: renoted }) as unknown as Misskey.entities.Note;
		const reply = (replied: Misskey.entities.Note) =>
			({ id: 'q2', text: 'reply', fileIds: [], replyId: 't1', reply: replied }) as unknown as Misskey.entities.Note;
		expect(noteRenderKey(quote(editedTarget))).toBe(noteRenderKey(quote(target)));
		expect(noteRenderKey(reply(editedTarget))).toBe(noteRenderKey(reply(target)));
	});
});

describe('useNoteEdits', () => {
	async function mountNested(source: Misskey.entities.Note) {
		const { useNoteEdits } = await import('@/features/notes/useNoteEdits.js');
		const viewed = pluginState.interrupt ? pluginState.interrupt(structuredClone(source))! : source;
		let nested!: ReturnType<typeof useNoteEdits>;
		render(
			defineComponent({
				setup() {
					nested = useNoteEdits(source, viewed, { subscribe: false });
					return () => h('div');
				},
			}),
		);
		return nested;
	}
	const quoted = { id: 'q', text: 'before', fileIds: [] } as unknown as Misskey.entities.Note;
	const outer = {
		id: 'o',
		text: 'outer',
		fileIds: [],
		renoteId: 'q',
		renote: quoted,
	} as unknown as Misskey.entities.Note;
	const edited = {
		id: 'q',
		text: 'secret after',
		fileIds: [],
		updatedAt: '2026-01-02T00:00:00.000Z',
	} as unknown as Misskey.entities.Note;

	afterEach(() => {
		pluginState.interrupt = null;
	});

	test('引用先の編集をその場で差し替え、関係のない編集では変えない', async () => {
		const { globalEvents } = await import('@/events.js');
		const nested = await mountNested(outer);
		globalEvents.emit('noteEdited', { ...edited, id: 'other' });
		expect(nested.quote.value?.text).toBe('before');
		globalEvents.emit('noteEdited', edited);
		expect(nested.quote.value?.text).toBe('secret after');
	});

	test('単なるリノートの先の引用先も差し替える', async () => {
		const { globalEvents } = await import('@/events.js');
		const pureRenote = {
			id: 'p',
			text: null,
			cw: null,
			replyId: null,
			poll: null,
			fileIds: [],
			renoteId: 'o',
			renote: outer,
		} as unknown as Misskey.entities.Note;
		const nested = await mountNested(pureRenote);
		globalEvents.emit('noteEdited', edited);
		expect(nested.quote.value?.text).toBe('secret after');
	});

	test('プラグインはノート全体に 1 回だけ通す (伏せ字は編集後にもかかり、入れ子の書き換えは重ならない)', async () => {
		const { globalEvents } = await import('@/events.js');
		pluginState.interrupt = (note) =>
			({
				...note,
				renote: note.renote
					? ({ ...note.renote, text: `[x] ${note.renote.text?.replaceAll('secret', '***')}` } as Misskey.entities.Note)
					: note.renote,
			}) as Misskey.entities.Note;
		const nested = await mountNested(outer);
		expect(nested.quote.value?.text).toBe('[x] before');
		globalEvents.emit('noteEdited', edited);
		expect(nested.quote.value?.text).toBe('[x] *** after');
	});

	test('プラグインがノートごと隠す判断をしても、前の表示を保つ (消えたノートとして出さない)', async () => {
		const { globalEvents } = await import('@/events.js');
		pluginState.interrupt = (note) => (note.renote?.text?.includes('secret') ? null : note);
		const nested = await mountNested(outer);
		globalEvents.emit('noteEdited', edited);
		expect(nested.quote.value?.text).toBe('before');
	});

	test('投稿の新しさを問わず、表示するノートと引用先の編集の合図だけを購読し、合図で取り直して差し替える', async () => {
		const { useNoteEdits } = await import('@/features/notes/useNoteEdits.js');
		const old = {
			...outer,
			id: 'old',
			createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
			renote: { ...quoted, id: 'oq' },
		} as Misskey.entities.Note;
		stream.send.mockClear();
		misskeyApiMock.mockReset();
		misskeyApiMock.mockResolvedValue({ ...edited, id: 'oq' });
		let nested!: ReturnType<typeof useNoteEdits>;
		const { unmount } = render(
			defineComponent({
				setup() {
					nested = useNoteEdits(old, old, { subscribe: true });
					return () => h('div');
				},
			}),
		);
		expect(stream.send).toHaveBeenCalledWith('se', { id: 'old' });
		expect(stream.send).toHaveBeenCalledWith('se', { id: 'oq' });
		expect(stream.send).not.toHaveBeenCalledWith('sr', expect.anything());

		stream.emit('noteUpdated', { id: 'oq', type: 'edited', body: { updatedAt: '2026-01-03T00:00:00.000Z' } });
		await vi.waitFor(() => expect(nested.quote.value?.text).toBe('secret after'));
		expect(misskeyApiMock).toHaveBeenCalledWith('notes/show', { noteId: 'oq' });

		unmount();
		expect(stream.send).toHaveBeenCalledWith('ue', { id: 'old' });
		expect(stream.send).toHaveBeenCalledWith('ue', { id: 'oq' });
		expect(stream.listenerCount('noteUpdated')).toBe(0);
	});

	test('未接続の間は購読を送らず、接続したときに 1 回だけ送る (接続時の送り直しと重ねない)', async () => {
		const { subscribeNoteEdits } = await import('@/features/notes/useNoteCapture.js');
		stream.send.mockClear();
		stream.state = 'reconnecting';
		try {
			const unsubscribe = subscribeNoteEdits({ id: 'pending', createdAt: new Date().toISOString() });
			expect(stream.send).not.toHaveBeenCalled();
			stream.emit('_connected_');
			expect(stream.send.mock.calls.filter(([type, body]) => type === 'se' && body.id === 'pending')).toHaveLength(1);
			unsubscribe();
		} finally {
			stream.state = 'connected';
		}
	});

	test('リアルタイムモードでなければ、ポーリングで届く編集日時の変化で 1 回だけ取り直す (表示から時間が経っても)', async () => {
		const { subscribeNoteEdits } = await import('@/features/notes/useNoteCapture.js');
		const { globalEvents } = await import('@/events.js');
		vi.useFakeTimers();
		storeState.realtimeMode = false;
		const editedEvents = vi.fn();
		globalEvents.on('noteEdited', editedEvents);
		let updatedAt: string | undefined;
		misskeyApiMock.mockReset();
		misskeyApiMock.mockImplementation(async (endpoint: string, params: { noteIds?: string[] }) =>
			endpoint === 'notes/show-partial-bulk'
				? (params.noteIds ?? []).map((id) => ({
						id,
						reactions: {},
						reactionEmojis: {},
						...(id === 'polled' && updatedAt ? { updatedAt } : {}),
					}))
				: { id: 'polled', text: 'after', updatedAt },
		);
		stream.send.mockClear();
		const unsubscribe = subscribeNoteEdits({ id: 'polled', createdAt: new Date().toISOString() });
		try {
			expect(stream.send).not.toHaveBeenCalled();
			// リアクションの queue が打ち切る 5 分を過ぎてから編集される。
			await vi.advanceTimersByTimeAsync(7 * 60_000);
			expect(editedEvents).not.toHaveBeenCalled();

			updatedAt = '2026-01-04T00:00:00.000Z';
			await vi.advanceTimersByTimeAsync(61_000);
			expect(editedEvents).toHaveBeenCalledTimes(1);
			// 同じ編集日時が届き続けても、取り直しは最初の 1 回だけ (差し替え後も購読は続く)。
			await vi.advanceTimersByTimeAsync(3 * 60_000);
			expect(misskeyApiMock.mock.calls.filter(([endpoint]) => endpoint === 'notes/show')).toHaveLength(1);
		} finally {
			unsubscribe();
			globalEvents.off('noteEdited', editedEvents);
			storeState.realtimeMode = true;
			vi.useRealTimers();
		}
	});

	test('ポーリングの問い合わせが失敗しても、未処理のエラーにせず次の回で編集を拾う', async () => {
		const { subscribeNoteEdits } = await import('@/features/notes/useNoteCapture.js');
		const { globalEvents } = await import('@/events.js');
		vi.useFakeTimers();
		storeState.realtimeMode = false;
		const editedEvents = vi.fn();
		globalEvents.on('noteEdited', editedEvents);
		let offline = true;
		misskeyApiMock.mockReset();
		misskeyApiMock.mockImplementation(async (endpoint: string, params: { noteIds?: string[] }) => {
			if (offline) throw new Error('offline');
			return endpoint === 'notes/show-partial-bulk'
				? (params.noteIds ?? []).map((id) => ({
						id,
						reactions: {},
						reactionEmojis: {},
						updatedAt: '2026-01-05T00:00:00.000Z',
					}))
				: { id: 'flaky', text: 'after' };
		});
		const unsubscribe = subscribeNoteEdits({ id: 'flaky', createdAt: new Date().toISOString() });
		try {
			await vi.advanceTimersByTimeAsync(61_000);
			expect(editedEvents).not.toHaveBeenCalled();
			offline = false;
			await vi.advanceTimersByTimeAsync(61_000);
			expect(editedEvents).toHaveBeenCalledTimes(1);
		} finally {
			unsubscribe();
			globalEvents.off('noteEdited', editedEvents);
			storeState.realtimeMode = true;
			vi.useRealTimers();
		}
	});

	test('ポーリングでの編集の検出は、リアクションの問い合わせ (新しい順に 30 件) からノートを押し出さない', async () => {
		const { subscribeNoteEdits, useNoteCapture } = await import('@/features/notes/useNoteCapture.js');
		vi.useFakeTimers();
		storeState.realtimeMode = false;
		misskeyApiMock.mockReset();
		misskeyApiMock.mockImplementation(async (_endpoint: string, params: { noteIds?: string[] }) =>
			(params.noteIds ?? []).map((id) => ({ id, reactions: {}, reactionEmojis: {} })),
		);
		// リノートされたばかりの古いノート (リアクションを追う対象) と、それより ID の新しい編集検出の対象 40 件。
		const oldNote = {
			id: '0000-old',
			createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
			reactions: {},
			reactionCount: 0,
			reactionEmojis: {},
			myReaction: null,
			poll: null,
		} as unknown as Misskey.entities.Note;
		const renote = { id: 'zzzz-renote', createdAt: new Date().toISOString() } as Misskey.entities.Note;
		const unsubscribes = Array.from({ length: 40 }, (_, i) =>
			subscribeNoteEdits({ id: `zzzz-${String(i).padStart(2, '0')}`, createdAt: new Date().toISOString() }),
		);
		const { unmount } = render(
			defineComponent({
				setup() {
					useNoteCapture({ note: oldNote, parentNote: renote }).subscribe();
					return () => h('div');
				},
			}),
		);
		try {
			await vi.advanceTimersByTimeAsync(30_000);
			const reactionPolls = misskeyApiMock.mock.calls.filter(([, params]) =>
				(params.noteIds ?? []).includes('0000-old'),
			);
			expect(reactionPolls.length).toBeGreaterThan(0);
		} finally {
			unmount();
			for (const unsubscribe of unsubscribes) unsubscribe();
			storeState.realtimeMode = true;
			vi.useRealTimers();
		}
	});
});
