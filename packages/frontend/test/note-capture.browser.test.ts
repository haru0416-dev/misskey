/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'eventemitter3';
import { defineComponent, h, nextTick } from 'vue';
import { cleanup, render } from '@testing-library/vue';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type * as Misskey from 'misskey-js';
import {
	applyEditedNote,
	noteEvents,
	noteRenderKey,
	subscribeNoteEdits,
	useNoteCapture,
} from '@/features/note/useNoteCapture.js';
import { useNoteEdits } from '@/features/note/useNoteEdits.js';
import { globalEvents } from '@/events.js';

const stream = Object.assign(new EventEmitter(), { send: vi.fn(), state: 'connected' });

vi.mock('@/stream.js', () => ({ useStream: () => stream }));
vi.mock('@/i.js', () => ({ $i: { id: 'me' } }));
const { storeState } = vi.hoisted(() => ({ storeState: { realtimeMode: true } }));
vi.mock('@/store.js', () => ({ store: storeState }));
vi.mock('@/preferences.js', () => ({ prefer: { pollingInterval: 3 } }));
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
		const other = { id: 'other', text: 'x' } as unknown as Misskey.entities.Note;
		expect(applyEditedNote(other, edited)).toBe(other);
	});

	test('リアクションは取り直した時点の値にする (描き直しで読み込み時の値に戻さない)', async () => {
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
		const nested = await mountNested(outer);
		globalEvents.emit('noteEdited', { ...edited, id: 'other' });
		expect(nested.quote.value?.text).toBe('before');
		globalEvents.emit('noteEdited', edited);
		expect(nested.quote.value?.text).toBe('secret after');
	});

	test('単なるリノートの先の引用先も差し替える', async () => {
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
		pluginState.interrupt = (note) => (note.renote?.text?.includes('secret') ? null : note);
		const nested = await mountNested(outer);
		globalEvents.emit('noteEdited', edited);
		expect(nested.quote.value?.text).toBe('before');
	});

	test('投稿の新しさを問わず、表示するノートと引用先の編集の合図だけを購読し、合図で取り直して差し替える', async () => {
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

	test('late older edit responses cannot roll back nested rendered content or its version', async () => {
		const first = Promise.withResolvers<Misskey.entities.Note>();
		const second = Promise.withResolvers<Misskey.entities.Note>();
		const old = {
			id: 'ordered-edit',
			text: 'initial',
			createdAt: new Date().toISOString(),
			fileIds: [],
		} as unknown as Misskey.entities.Note;
		const source = { ...outer, id: 'ordered-outer', renote: old } as Misskey.entities.Note;
		misskeyApiMock.mockReset();
		misskeyApiMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
		const screen = render(
			defineComponent({
				setup() {
					const nested = useNoteEdits(source, source, { subscribe: true });
					return () => h('div', nested.quote.value?.text ?? '');
				},
			}),
		);
		stream.emit('noteUpdated', { id: old.id, type: 'edited', body: { updatedAt: '2026-01-01T00:00:00.000Z' } });
		stream.emit('noteUpdated', { id: old.id, type: 'edited', body: { updatedAt: '2026-01-02T00:00:00.000Z' } });
		second.resolve({ ...old, text: 'newer edit', updatedAt: '2026-01-02T00:00:00.000Z' });
		await second.promise;
		await nextTick();
		expect(screen.getByText('newer edit')).toBeTruthy();
		first.resolve({ ...old, text: 'older edit', updatedAt: '2026-01-01T00:00:00.000Z' });
		await first.promise;
		await nextTick();
		expect(screen.getByText('newer edit')).toBeTruthy();
		expect(screen.queryByText('older edit')).toBeNull();
	});

	test('partial success does not acknowledge an edit until the full note fetch succeeds', async () => {
		vi.useFakeTimers();
		storeState.realtimeMode = false;
		let fullAttempts = 0;
		const editedEvents = vi.fn();
		globalEvents.on('noteEdited', editedEvents);
		misskeyApiMock.mockReset();
		misskeyApiMock.mockImplementation(async (endpoint: string) => {
			if (endpoint === 'notes/show-partial-bulk') {
				return [{ id: 'full-retry', updatedAt: '2026-01-06T00:00:00.000Z', reactions: {}, reactionEmojis: {} }];
			}
			fullAttempts++;
			if (fullAttempts === 1) throw new TypeError('offline full note');
			return { id: 'full-retry', text: 'recovered edit', updatedAt: '2026-01-06T00:00:00.000Z' };
		});
		const unsubscribe = subscribeNoteEdits({ id: 'full-retry', createdAt: new Date().toISOString() });
		try {
			await vi.advanceTimersByTimeAsync(60_000);
			expect(editedEvents).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(60_000);
			expect(editedEvents).toHaveBeenCalledWith(expect.objectContaining({ text: 'recovered edit' }));
			await vi.advanceTimersByTimeAsync(120_000);
			expect(fullAttempts).toBe(2);
		} finally {
			unsubscribe();
			globalEvents.off('noteEdited', editedEvents);
			storeState.realtimeMode = true;
			vi.useRealTimers();
		}
	});

	test.each(['reacted', 'unreacted'] as const)(
		'a confirmed %s event survives its older polling snapshot',
		async (event) => {
			vi.useFakeTimers();
			storeState.realtimeMode = false;
			const held = Promise.withResolvers<Misskey.entities.NotesShowPartialBulkResponse>();
			misskeyApiMock.mockReset();
			misskeyApiMock.mockReturnValueOnce(held.promise);
			const note = {
				id: `reaction-race-${event}`,
				createdAt: new Date().toISOString(),
				reactions: event === 'unreacted' ? { '👍': 1 } : {},
				reactionCount: event === 'unreacted' ? 1 : 0,
				reactionEmojis: {},
				myReaction: event === 'unreacted' ? '👍' : null,
				poll: null,
			} as unknown as Misskey.entities.Note;
			const screen = render(
				defineComponent({
					setup() {
						const { $note } = useNoteCapture({ note, parentNote: null });
						return () => h('div', `${$note.myReaction ?? '-'}:${$note.reactions['👍'] ?? 0}:${$note.reactionCount}`);
					},
				}),
			);
			try {
				await vi.advanceTimersByTimeAsync(10_000);
				noteEvents.emit(`${event}:${note.id}`, { userId: 'me', reaction: '👍' });
				held.resolve([{ id: note.id, reactions: note.reactions, reactionEmojis: {} }]);
				await held.promise;
				await nextTick();
				expect(screen.getByText(event === 'reacted' ? '👍:1:1' : '-:0:0')).toBeTruthy();
			} finally {
				screen.unmount();
				storeState.realtimeMode = true;
				vi.useRealTimers();
			}
		},
	);

	test('offline reaction polling is consumed and the next cycle refreshes the rendered counts', async () => {
		vi.useFakeTimers();
		storeState.realtimeMode = false;
		const note = {
			id: 'reaction-offline',
			createdAt: new Date().toISOString(),
			reactions: {},
			reactionCount: 0,
			reactionEmojis: {},
			myReaction: null,
			poll: null,
		} as unknown as Misskey.entities.Note;
		misskeyApiMock.mockReset();
		misskeyApiMock
			.mockRejectedValueOnce(new TypeError('offline reactions'))
			.mockResolvedValueOnce([{ id: note.id, reactions: { '👍': 2 }, reactionEmojis: {} }]);
		const screen = render(
			defineComponent({
				setup() {
					const { $note } = useNoteCapture({ note, parentNote: null });
					return () => h('div', String($note.reactionCount));
				},
			}),
		);
		try {
			await vi.advanceTimersByTimeAsync(10_000);
			expect(screen.getByText('0')).toBeTruthy();
			await vi.advanceTimersByTimeAsync(10_000);
			expect(screen.getByText('2')).toBeTruthy();
		} finally {
			screen.unmount();
			storeState.realtimeMode = true;
			vi.useRealTimers();
		}
	});

	test('an edit polling pass does not request later chunks after all those displays are removed', async () => {
		vi.useFakeTimers();
		storeState.realtimeMode = false;
		const held = Promise.withResolvers<Misskey.entities.NotesShowPartialBulkResponse>();
		misskeyApiMock.mockReset();
		misskeyApiMock.mockReturnValueOnce(held.promise);
		const unsubscribes = Array.from({ length: 201 }, (_, i) =>
			subscribeNoteEdits({ id: `removed-chunk-${i}`, createdAt: new Date().toISOString() }),
		);
		try {
			await vi.advanceTimersByTimeAsync(60_000);
			for (const unsubscribe of unsubscribes) unsubscribe();
			held.resolve([]);
			await held.promise;
			await vi.advanceTimersByTimeAsync(0);
			expect(misskeyApiMock).toHaveBeenCalledTimes(1);
			misskeyApiMock.mockResolvedValue([]);
			const unsubscribe = subscribeNoteEdits({ id: 'resubscribed-chunk', createdAt: new Date().toISOString() });
			await vi.advanceTimersByTimeAsync(60_000);
			expect(misskeyApiMock.mock.lastCall?.[1]).toEqual({ noteIds: ['resubscribed-chunk'] });
			unsubscribe();
		} finally {
			for (const unsubscribe of unsubscribes) unsubscribe();
			storeState.realtimeMode = true;
			vi.useRealTimers();
		}
	});

	test('reaction polling selects newest eligible IDs and duplicate mounts refresh their expiry', async () => {
		vi.useFakeTimers();
		storeState.realtimeMode = false;
		misskeyApiMock.mockReset();
		misskeyApiMock.mockImplementation(async (_endpoint: string, params: { noteIds: string[] }) =>
			params.noteIds.map((id) => ({ id, reactions: { '👍': 1 }, reactionEmojis: {} })),
		);
		const notes = Array.from(
			{ length: 300 },
			(_, i) =>
				({
					id: `selection-${String(i).padStart(4, '0')}`,
					createdAt: new Date().toISOString(),
					reactions: {},
					reactionCount: 0,
					reactionEmojis: {},
					myReaction: null,
					poll: null,
				}) as unknown as Misskey.entities.Note,
		);
		const screen = render(
			defineComponent({
				setup() {
					const captures = notes.map((note) => useNoteCapture({ note, parentNote: null }).$note);
					return () => h('div', captures.filter((note) => note.reactionCount === 1).length);
				},
			}),
		);
		let duplicate: { unmount(): void } | undefined;
		try {
			await vi.advanceTimersByTimeAsync(10_000);
			expect(misskeyApiMock.mock.lastCall?.[1]).toEqual({
				noteIds: notes
					.slice(-30)
					.map((note) => note.id)
					.reverse(),
			});
			expect(screen.getByText('30')).toBeTruthy();
			await vi.advanceTimersByTimeAsync(280_000);
			duplicate = render(
				defineComponent({
					setup() {
						useNoteCapture({ note: notes[0]!, parentNote: null });
						return () => h('span');
					},
				}),
			);
			await vi.advanceTimersByTimeAsync(10_000);
			expect(misskeyApiMock.mock.lastCall?.[1]).toEqual({ noteIds: [notes[0]!.id] });
			expect(screen.getByText('31')).toBeTruthy();
		} finally {
			duplicate?.unmount();
			screen.unmount();
			storeState.realtimeMode = true;
			vi.useRealTimers();
		}
	});
});
