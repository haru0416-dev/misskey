/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { checkWordMute } from '@/features/notes/check-word-mute.js';

function note(text: string) {
	return { userId: 'other', text, cw: null } as any;
}

describe('checkWordMute', () => {
	test('matches keyword groups and regular expressions', () => {
		const mutedWords = [['hello', '', 'world'], '/cat/i'];

		expect(checkWordMute(note('hello world and CAT'), null, mutedWords)).toEqual(mutedWords);
	});

	test('resets stateful regular expressions between notes', () => {
		const mutedWords = ['/cat/g'];

		expect(checkWordMute(note('cat'), null, mutedWords)).toEqual(mutedWords);
		expect(checkWordMute(note('cat'), null, mutedWords)).toEqual(mutedWords);
	});

	test('does not mute the current user or empty notes', () => {
		expect(checkWordMute(note('blocked'), { id: 'other' } as any, [['blocked']])).toBe(false);
		expect(checkWordMute(note(''), null, [['blocked']])).toBe(false);
	});
});
