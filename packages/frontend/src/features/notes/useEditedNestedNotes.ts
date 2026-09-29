/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onUnmounted, shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import type { ShallowRef } from 'vue';
import { useGlobalEvent } from '@/events.js';
import { getAppearNote } from '@/features/notes/get-appear-note.js';
import { applyEditedNote, subscribeNoteEdits } from '@/features/notes/useNoteCapture.js';
import { applyNoteViewInterruptors, getPluginHandlers } from '@/plugin.js';
import { deepClone } from '@/utility/clone.js';

function nestedOf(note: Misskey.entities.Note): {
	reply: Misskey.entities.Note | null;
	quote: Misskey.entities.Note | null;
} {
	const appear = getAppearNote(note) ?? note;
	return { reply: appear.reply ?? null, quote: appear.renote ?? null };
}

/**
 * ノートの中に出す返信先・引用先。編集されたらその場で差し替える (外側のノートを描き直すと、読み込み後に増えた
 * リアクション等の状態が消えるため)。
 *
 * @param source プラグインを通す前のノート。
 * @param viewed 表示に使っている、プラグインを通した後のノート。
 * @param options.subscribe 編集の合図の購読。recent は外側のノートが新しいときだけ (一覧)、always は新しさを問わず
 * (詳細ページ)、never は購読しない (見本の表示)。
 */
export function useEditedNestedNotes(
	source: Misskey.entities.Note,
	viewed: Misskey.entities.Note,
	options: { subscribe: 'recent' | 'always' | 'never' },
): { reply: ShallowRef<Misskey.entities.Note | null>; quote: ShallowRef<Misskey.entities.Note | null> } {
	const initial = nestedOf(viewed);
	const reply = shallowRef(initial.reply);
	const quote = shallowRef(initial.quote);
	if (options.subscribe !== 'never') {
		const unsubscribes = [initial.reply, initial.quote]
			.filter((note) => note != null)
			.map((note) => subscribeNoteEdits(note, options.subscribe === 'always' ? null : viewed));
		onUnmounted(() => {
			for (const unsubscribe of unsubscribes) unsubscribe();
		});
	}
	let current = source;
	useGlobalEvent('noteEdited', (edited) => {
		if (reply.value?.id !== edited.id && quote.value?.id !== edited.id) {
			return;
		}
		current = applyEditedNote(current, edited);
		let next: Misskey.entities.Note | null = current;
		// 最初の表示と同じく、プラグインにはノート全体を 1 回だけ通す (入れ子を書き換えるプラグインを二重にかけない)。
		if (getPluginHandlers('note_view_interruptor').length > 0) {
			next = applyNoteViewInterruptors(deepClone(current));
			// ノートごと隠す判断になっても、ここからは外側のノートを消せないので前の表示を保つ。
			if (next == null) {
				return;
			}
		}
		const nested = nestedOf(next);
		reply.value = nested.reply;
		quote.value = nested.quote;
	});
	return { reply, quote };
}
