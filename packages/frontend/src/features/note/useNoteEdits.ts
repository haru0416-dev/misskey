/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onUnmounted, shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import type { ShallowRef } from 'vue';
import { useGlobalEvent } from '@/events.js';
import { getAppearNote } from '@/features/note/get-appear-note.js';
import { applyEditedNote, subscribeNoteEdits } from '@/features/note/useNoteCapture.js';
import { applyNoteViewInterruptors, getPluginHandlers } from '@/plugin.js';
import { deepClone } from '@/utility/clone.js';

function nestedOf(note: Misskey.entities.Note): {
	appear: Misskey.entities.Note;
	reply: Misskey.entities.Note | null;
	quote: Misskey.entities.Note | null;
} {
	const appear = getAppearNote(note) ?? note;
	return { appear, reply: appear.reply ?? null, quote: appear.renote ?? null };
}

/**
 * 表示するノートと、その中に出す返信先・引用先の編集を受け取る。返信先・引用先はその場で差し替える (外側のノートを
 * 描き直すと、読み込み後に増えたリアクション等の状態が消えるため)。表示するノート自身の編集は、一覧やページが
 * key を変えて描き直す。
 *
 * @param source プラグインを通す前のノート。
 * @param viewed 表示に使っている、プラグインを通した後のノート。
 * @param options.subscribe 編集の合図を購読するか (見本の表示では購読しない)。
 */
export function useNoteEdits(
	source: Misskey.entities.Note,
	viewed: Misskey.entities.Note,
	options: { subscribe: boolean },
): { reply: ShallowRef<Misskey.entities.Note | null>; quote: ShallowRef<Misskey.entities.Note | null> } {
	const initial = nestedOf(viewed);
	const reply = shallowRef(initial.reply);
	const quote = shallowRef(initial.quote);
	if (options.subscribe) {
		const unsubscribes = [initial.appear, initial.reply, initial.quote]
			.filter((note) => note != null)
			.map((note) => subscribeNoteEdits(note));
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
