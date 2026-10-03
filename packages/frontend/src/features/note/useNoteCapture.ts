/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onUnmounted, reactive } from 'vue';
import * as Misskey from 'misskey-js';
import { EventEmitter } from 'eventemitter3';
import type { Reactive } from 'vue';
import type { NoteUpdatedEvent } from 'misskey-js/streaming.types.js';
import { useStream } from '@/stream.js';
import { $i } from '@/i.js';
import { store } from '@/store.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { globalEvents } from '@/events.js';
import { PollingScheduler } from '@/utility/polling-scheduler.js';

export const noteEvents = new EventEmitter<{
	[ev: `reacted:${string}`]: (ctx: {
		userId: Misskey.entities.User['id'];
		reaction: string;
		emoji?: { name: string; url: string } | null;
	}) => void;
	[ev: `unreacted:${string}`]: (ctx: {
		userId: Misskey.entities.User['id'];
		reaction: string;
		emoji?: { name: string; url: string } | null;
	}) => void;
	[ev: `pollVoted:${string}`]: (ctx: { userId: Misskey.entities.User['id']; choice: number }) => void;
}>();

// 同じ編集通知が複数の表示から届くため、取得中と取得終了後の 10 秒間は重複取得を抑える。
const editedNoteFetches = new Set<string>();

function refetchEditedNote(noteId: Misskey.entities.Note['id'], updatedAt: string): void {
	const key = `${noteId}:${updatedAt}`;
	if (editedNoteFetches.has(key)) {
		return;
	}
	editedNoteFetches.add(key);
	misskeyApi('notes/show', { noteId })
		.then((note) => globalEvents.emit('noteEdited', note))
		.catch(() => {})
		.finally(() => window.setTimeout(() => editedNoteFetches.delete(key), 10_000));
}

// 編集後の取り直しで当てる列。編集で変わりうる列に加え、リアクション・投票も取り直した時点の値にする
// (描き直した MkNote はこの項目から状態を作り直すので、一覧の読み込み時の値に戻さないため)。
// 取り直した側に無い列 (タグを全部消した等) は項目からも消す。
const refreshedNoteKeys = [
	'text',
	'cw',
	'files',
	'fileIds',
	'emojis',
	'tags',
	'mentions',
	'visibility',
	'updatedAt',
	'reactions',
	'reactionCount',
	'reactionEmojis',
	'myReaction',
	'poll',
] as const;

function withEditedFields<T extends Misskey.entities.Note>(target: T, edited: Misskey.entities.Note): T {
	const next: Record<string, unknown> = { ...target };
	for (const key of refreshedNoteKeys) {
		if (key in edited) {
			next[key] = edited[key];
		} else {
			delete next[key];
		}
	}
	return next as T;
}

/**
 * 一覧の項目に、取り直した編集後のノートの中身を当てる。項目がそのノートか、リノート・返信として (入れ子を含めて)
 * そのノートを含むときだけ新しいオブジェクトを返す (それ以外は同じ参照)。一覧が項目に付けた印を消さないよう、
 * 編集で変わる列だけ書き換える。
 */
export function applyEditedNote<T extends Misskey.entities.Note>(item: T, edited: Misskey.entities.Note): T {
	let next = item.id === edited.id ? withEditedFields(item, edited) : item;
	const renote = next.renote == null ? next.renote : applyEditedNote(next.renote, edited);
	const reply = next.reply == null ? next.reply : applyEditedNote(next.reply, edited);
	if (renote !== next.renote) next = { ...next, renote };
	if (reply !== next.reply) next = { ...next, reply };
	return next;
}

/**
 * ノートの描画の key。MkNote は受け取ったノートを最初に一度だけ解釈するので、表示の主体 (ノート自身か、単なる
 * リノートならリノート先) が編集されたら描き直させる。引用先・返信先の編集は MkNote の中で差し替えるので含めない
 * (含めると外側のノートの、読み込み後に増えたリアクション等の状態まで作り直してしまう)。
 */
export function noteRenderKey(note: Misskey.entities.Note): string {
	// リノート先を取れなかった項目は renote が null で届く。
	const renoteUpdatedAt = Misskey.note.isPureRenote(note) ? (note.renote?.updatedAt ?? '') : '';
	return `${note.id}:${note.updatedAt ?? ''}:${renoteUpdatedAt}`;
}

const fetchEvent = new EventEmitter<{
	[id: string]: Pick<Misskey.entities.Note, 'reactions' | 'reactionEmojis'>;
}>();

const pollingQueue = new Map<
	string,
	{
		referenceCount: number;
		lastAddedAt: number;
	}
>();

function pollingEnqueue(note: Pick<Misskey.entities.Note, 'id' | 'createdAt'>) {
	const data = pollingQueue.get(note.id);
	if (data != null) {
		data.referenceCount++;
		data.lastAddedAt = Date.now();
	} else {
		pollingQueue.set(note.id, {
			referenceCount: 1,
			lastAddedAt: Date.now(),
		});
	}
	pollingScheduler.start();
}

function pollingDequeue(note: Pick<Misskey.entities.Note, 'id' | 'createdAt'>) {
	const data = pollingQueue.get(note.id);
	if (data == null) {
		return;
	}

	if (data.referenceCount === 1) {
		pollingQueue.delete(note.id);
		if (pollingQueue.size === 0) {
			pollingScheduler.stop();
		}
	} else {
		data.referenceCount--;
	}
}

const CAPTURE_MAX = 30;
const MIN_POLLING_INTERVAL = 1000 * 10;
const POLLING_INTERVAL =
	prefer.pollingInterval === 1
		? MIN_POLLING_INTERVAL * 1.5 * 1.5
		: prefer.pollingInterval === 2
			? MIN_POLLING_INTERVAL * 1.5
			: MIN_POLLING_INTERVAL;

const pollingScheduler = new PollingScheduler(async () => {
	const ids = [...pollingQueue.entries()]
		.filter(([, data]) => Date.now() - data.lastAddedAt < 1000 * 60 * 5)
		.map(([id]) => id)
		.sort((a, b) => (a > b ? -1 : 1))
		.slice(0, CAPTURE_MAX);

	if (ids.length === 0) {
		pollingScheduler.stop();
		return;
	}

	const items = await misskeyApi('notes/show-partial-bulk', {
		noteIds: ids,
	});
	for (const item of items) {
		fetchEvent.emit(item.id, {
			reactions: item.reactions,
			reactionEmojis: item.reactionEmojis,
		});
	}
}, POLLING_INTERVAL);

// ポーリングでの編集の検出。リアクションの queue (追加から 5 分・新しい順に 30 件) とは分ける。編集は古いノートにも
// 起きるので表示中のノートをすべて見るが、編集はまれなので間隔を長くする。
const EDIT_POLLING_INTERVAL = 1000 * 60;
// notes/show-partial-bulk の noteIds の上限。
const EDIT_POLLING_CHUNK = 100;
const editPollingTargets = new Map<string, number>();
const editFetchEvent = new EventEmitter<{ [id: string]: (updatedAt: string | undefined) => void }>();
const editPollingScheduler = new PollingScheduler(async () => {
	const ids = [...editPollingTargets.keys()];
	if (ids.length === 0) {
		editPollingScheduler.stop();
		return;
	}
	try {
		for (let i = 0; i < ids.length; i += EDIT_POLLING_CHUNK) {
			const items = await misskeyApi('notes/show-partial-bulk', { noteIds: ids.slice(i, i + EDIT_POLLING_CHUNK) });
			for (const item of items) {
				editFetchEvent.emit(item.id, item.updatedAt);
			}
		}
	} catch {
		// 打ち切りの無い繰り返しなので、オフラインの間に毎回の失敗を未処理のエラーとして報告させない。次の回に問い合わせ直す。
	}
}, EDIT_POLLING_INTERVAL);

/** 購読を始め、解除する関数を返す。解除は呼び出し元の onUnmounted が行う (クリック時の購読も対象にするため)。 */
function pollingSubscribe(props: {
	note: Pick<Misskey.entities.Note, 'id' | 'createdAt'>;
	$note: ReactiveNoteData;
}): () => void {
	const { note, $note } = props;

	function onFetched(data: Pick<Misskey.entities.Note, 'reactions' | 'reactionEmojis'>): void {
		$note.reactions = data.reactions;
		let reactionCount = 0;
		for (const reaction in data.reactions) {
			reactionCount += data.reactions[reaction] ?? 0;
		}
		$note.reactionCount = reactionCount;
		$note.reactionEmojis = data.reactionEmojis;
	}

	pollingEnqueue(note);
	fetchEvent.on(note.id, onFetched);

	return () => {
		pollingDequeue(note);
		fetchEvent.off(note.id, onFetched);
	};
}

function realtimeSubscribe(props: { note: Pick<Misskey.entities.Note, 'id' | 'createdAt'> }): () => void {
	const note = props.note;
	const connection = useStream();

	function onStreamNoteUpdated(noteData: NoteUpdatedEvent): void {
		const { type, id, body } = noteData;

		if (id !== note.id) {
			return;
		}

		switch (type) {
			case 'reacted': {
				noteEvents.emit(`reacted:${id}`, {
					userId: body.userId,
					reaction: body.reaction,
					...(body.emoji === undefined ? {} : { emoji: body.emoji }),
				});
				break;
			}

			case 'unreacted': {
				noteEvents.emit(`unreacted:${id}`, {
					userId: body.userId,
					reaction: body.reaction,
				});
				break;
			}

			case 'pollVoted': {
				noteEvents.emit(`pollVoted:${id}`, {
					userId: body.userId,
					choice: body.choice,
				});
				break;
			}

			case 'deleted': {
				globalEvents.emit('noteDeleted', id);
				break;
			}

			case 'edited': {
				refetchEditedNote(id, body.updatedAt);
				break;
			}
		}
	}

	function capture(): void {
		connection.send('sr', { id: note.id });
	}

	connection.on('noteUpdated', onStreamNoteUpdated);
	// 未接続の間の送信は接続時にまとめて送られ、_connected_ でも送り直すので 2 回の購読になる (解除 1 回では残る)。
	if (connection.state === 'connected') {
		capture();
	}
	connection.on('_connected_', capture);

	return () => {
		connection.send('un', { id: note.id });
		connection.off('noteUpdated', onStreamNoteUpdated);
		connection.off('_connected_', capture);
	};
}

// 投稿から一定時間が経ったノートは、イベントが起きる見込みが低いので購読しない。
const SUBSCRIBE_WINDOW = 1000 * 60 * 5;

/**
 * 編集の合図だけを購読し、解除する関数を返す。リアクション等は受け取らないので、投稿の新しさを問わず表示中のノートすべてに使える。
 * リアルタイムモードでなければ、リアクション用とは別のポーリングで最終の編集日時の変化を調べる。
 */
export function subscribeNoteEdits(note: Pick<Misskey.entities.Note, 'id' | 'createdAt' | 'updatedAt'>): () => void {
	if ($i && store.realtimeMode) {
		const connection = useStream();
		function onStreamNoteUpdated(data: NoteUpdatedEvent): void {
			if (data.id === note.id && data.type === 'edited') {
				refetchEditedNote(data.id, data.body.updatedAt);
			}
		}
		function capture(): void {
			connection.send('se', { id: note.id });
		}
		// 未接続の間の送信は接続時にまとめて送られ、_connected_ でも送り直すので 2 回の購読になる (解除 1 回では残る)。
		if (connection.state === 'connected') {
			capture();
		}
		connection.on('noteUpdated', onStreamNoteUpdated);
		connection.on('_connected_', capture);
		return () => {
			connection.send('ue', { id: note.id });
			connection.off('noteUpdated', onStreamNoteUpdated);
			connection.off('_connected_', capture);
		};
	}

	// 差し替えた後も同じ購読が続くので、見つけた編集の日時を覚えて同じ編集で取り直し続けない。
	let known = note.updatedAt;
	function onFetched(updatedAt: string | undefined): void {
		if (updatedAt != null && updatedAt !== known) {
			known = updatedAt;
			refetchEditedNote(note.id, updatedAt);
		}
	}
	editPollingTargets.set(note.id, (editPollingTargets.get(note.id) ?? 0) + 1);
	editFetchEvent.on(note.id, onFetched);
	editPollingScheduler.start();
	return () => {
		const count = editPollingTargets.get(note.id) ?? 0;
		if (count <= 1) {
			editPollingTargets.delete(note.id);
		} else {
			editPollingTargets.set(note.id, count - 1);
		}
		editFetchEvent.off(note.id, onFetched);
		if (editPollingTargets.size === 0) {
			editPollingScheduler.stop();
		}
	};
}

export type ReactiveNoteData = {
	reactions: Misskey.entities.Note['reactions'];
	reactionCount: Misskey.entities.Note['reactionCount'];
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReaction: Misskey.entities.Note['myReaction'];
	pollChoices: NonNullable<Misskey.entities.Note['poll']>['choices'];
};

const noReaction = Symbol();

export function useNoteCapture(props: {
	note: Misskey.entities.Note;
	parentNote: Misskey.entities.Note | null;
	mock?: boolean;
}): {
	$note: Reactive<ReactiveNoteData>;
	subscribe: () => void;
} {
	const { note, parentNote, mock } = props;

	const normalizedReactions: Misskey.entities.Note['reactions'] = {};
	for (const name in note.reactions) {
		const normalizedName = name.replace(/^:(\w+):$/, ':$1@.:');
		normalizedReactions[normalizedName] = (normalizedReactions[normalizedName] ?? 0) + (note.reactions[name] ?? 0);
	}

	const $note = reactive<ReactiveNoteData>({
		reactions: normalizedReactions,
		reactionCount: note.reactionCount,
		reactionEmojis: note.reactionEmojis,
		myReaction: note.myReaction,
		pollChoices: note.poll?.choices ?? [],
	});

	noteEvents.on(`reacted:${note.id}`, onReacted);
	noteEvents.on(`unreacted:${note.id}`, onUnreacted);
	noteEvents.on(`pollVoted:${note.id}`, onPollVoted);

	const reactionUserMap = new Map<Misskey.entities.User['id'], string | typeof noReaction>();
	let latestPollVotedKey: string | null = null;

	function onReacted(ctx: {
		userId: Misskey.entities.User['id'];
		reaction: string;
		emoji?: { name: string; url: string } | null;
	}): void {
		let normalizedName = ctx.reaction.replace(/^:(\w+):$/, ':$1@.:');
		normalizedName = normalizedName.includes('\u200D') ? normalizedName : normalizedName.replaceAll('️', '');
		if (reactionUserMap.get(ctx.userId) === normalizedName) {
			return;
		}
		reactionUserMap.set(ctx.userId, normalizedName);

		if (ctx.emoji && !(ctx.emoji.name in $note.reactionEmojis)) {
			$note.reactionEmojis[ctx.emoji.name] = ctx.emoji.url;
		}

		const currentCount = $note.reactions[normalizedName] || 0;

		$note.reactions[normalizedName] = currentCount + 1;
		$note.reactionCount += 1;

		if ($i && ctx.userId === $i.id) {
			$note.myReaction = normalizedName;
		}
	}

	function onUnreacted(ctx: {
		userId: Misskey.entities.User['id'];
		reaction: string;
		emoji?: { name: string; url: string } | null;
	}): void {
		let normalizedName = ctx.reaction.replace(/^:(\w+):$/, ':$1@.:');
		normalizedName = normalizedName.includes('\u200D') ? normalizedName : normalizedName.replaceAll('️', '');

		// 確実に一度リアクションされて取り消されている場合のみ処理をとめる（APIで初回読み込み→Streamでアップデート等の場合、reactionUserMapに情報がないため）
		if (reactionUserMap.get(ctx.userId) === noReaction) {
			return;
		}
		reactionUserMap.set(ctx.userId, noReaction);

		const currentCount = $note.reactions[normalizedName] || 0;

		$note.reactions[normalizedName] = Math.max(0, currentCount - 1);
		$note.reactionCount = Math.max(0, $note.reactionCount - 1);
		if ($note.reactions[normalizedName] === 0) {
			delete $note.reactions[normalizedName];
		}

		if ($i && ctx.userId === $i.id) {
			$note.myReaction = null;
		}
	}

	function onPollVoted(ctx: { userId: Misskey.entities.User['id']; choice: number }): void {
		const newPollVotedKey = `${ctx.userId}:${ctx.choice}`;
		if (newPollVotedKey === latestPollVotedKey) {
			return;
		}
		latestPollVotedKey = newPollVotedKey;

		const choices = [...$note.pollChoices];
		const choice = choices[ctx.choice];
		if (choice == null) {
			return;
		}
		choices[ctx.choice] = {
			...choice,
			votes: choice.votes + 1,
			...($i && ctx.userId === $i.id
				? {
						isVoted: true,
					}
				: {}),
		};

		$note.pollChoices = choices;
	}

	// 購読中なら解除する関数。クリック時 (リノートなど) にも購読し始めるので、setup で登録した onUnmounted から解除する。
	let unsubscribe: (() => void) | null = null;

	function subscribe() {
		if (mock) {
			return;
		}
		if (unsubscribe != null) {
			return;
		}

		unsubscribe =
			$i && store.realtimeMode
				? realtimeSubscribe({
						note,
					})
				: pollingSubscribe({
						note,
						$note,
					});
	}

	onUnmounted(() => {
		noteEvents.off(`reacted:${note.id}`, onReacted);
		noteEvents.off(`unreacted:${note.id}`, onUnreacted);
		noteEvents.off(`pollVoted:${note.id}`, onPollVoted);
		unsubscribe?.();
		unsubscribe = null;
	});

	// 投稿からある程度経過している(=タイムラインを遡って表示した)ノートは、イベントが発生する可能性が低いためそもそも購読しない
	// ただし「リノートされたばかりの過去のノート」(= parentNoteが存在し、かつparentNoteの投稿日時が最近)はイベント発生が考えられるため購読する
	if (parentNote == null) {
		if (Date.now() - new Date(note.createdAt).getTime() > SUBSCRIBE_WINDOW) {
			return {
				$note,
				subscribe: () => {
					subscribe();
				},
			};
		}
	} else {
		if (Date.now() - new Date(parentNote.createdAt).getTime() > SUBSCRIBE_WINDOW) {
			return {
				$note,
				subscribe: () => {
					subscribe();
				},
			};
		}
	}

	subscribe();

	return {
		$note,
		subscribe: () => {},
	};
}
