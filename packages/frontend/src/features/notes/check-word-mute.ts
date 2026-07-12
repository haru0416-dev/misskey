/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import * as Misskey from 'misskey-js';

type CompiledMute = { source: string[]; keywords: string[] } | { source: string; regexp: RegExp };

const compiledMutesCache = new WeakMap<Array<string | string[]>, CompiledMute[]>();

function compileMutes(mutedWords: Array<string | string[]>): CompiledMute[] {
	const cached = compiledMutesCache.get(mutedWords);
	if (cached != null) return cached;

	const compiled: CompiledMute[] = [];
	for (const filter of mutedWords) {
		if (Array.isArray(filter)) {
			const keywords = filter.filter((keyword) => keyword !== '');
			if (keywords.length > 0) compiled.push({ source: filter, keywords });
			continue;
		}

		const regexp = filter.match(/^\/(.+)\/(.*)$/);
		if (regexp == null) continue;
		try {
			compiled.push({ source: filter, regexp: new RegExp(regexp[1], regexp[2]) });
		} catch (_) {
			// This should never happen due to input sanitisation.
		}
	}

	compiledMutesCache.set(mutedWords, compiled);
	return compiled;
}

export function checkWordMute(
	note: Misskey.entities.Note,
	me: Misskey.entities.UserLite | null | undefined,
	mutedWords: Array<string | string[]>,
): Array<string | string[]> | false {
	// 自分自身
	if (me && note.userId === me.id) return false;

	if (mutedWords.length > 0) {
		const text = ((note.cw ?? '') + '\n' + (note.text ?? '')).trim();

		if (text === '') return false;

		const matched: Array<string | string[]> = [];
		for (const filter of compileMutes(mutedWords)) {
			if ('keywords' in filter) {
				if (filter.keywords.every((keyword) => text.includes(keyword))) matched.push(filter.source);
			} else {
				filter.regexp.lastIndex = 0;
				if (filter.regexp.test(text)) matched.push(filter.source);
			}
		}

		if (matched.length > 0) return matched;
	}

	return false;
}
