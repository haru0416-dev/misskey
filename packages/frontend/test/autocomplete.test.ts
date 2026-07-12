/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import { searchEmoji } from '@/utility/search-emoji.js';

describe('emoji autocomplete', () => {
	test('名前の完全一致は名前の前方一致より優先される', async () => {
		const result = searchEmoji('foooo', [
			{ emoji: ':foooo:', name: 'foooo' },
			{ emoji: ':foooobaaar:', name: 'foooobaaar' },
		]);
		assert.equal(result[0].emoji, ':foooo:');
	});

	test('名前の前方一致は名前の部分一致より優先される', async () => {
		const result = searchEmoji('baaa', [
			{ emoji: ':baaar:', name: 'baaar' },
			{ emoji: ':foooobaaar:', name: 'foooobaaar' },
		]);
		assert.equal(result[0].emoji, ':baaar:');
	});

	test('名前の完全一致はタグの完全一致より優先される', async () => {
		const result = searchEmoji('foooo', [
			{ emoji: ':foooo:', name: 'foooo' },
			{ emoji: ':baaar:', name: 'foooo', aliasOf: 'baaar' },
		]);
		assert.equal(result[0].emoji, ':foooo:');
	});

	test('名前の前方一致はタグの前方一致より優先される', async () => {
		const result = searchEmoji('foo', [
			{ emoji: ':foooo:', name: 'foooo' },
			{ emoji: ':baaar:', name: 'foooo', aliasOf: 'baaar' },
		]);
		assert.equal(result[0].emoji, ':foooo:');
	});

	test('名前の部分一致はタグの部分一致より優先される', async () => {
		const result = searchEmoji('oooo', [
			{ emoji: ':foooo:', name: 'foooo' },
			{ emoji: ':baaar:', name: 'foooo', aliasOf: 'baaar' },
		]);
		assert.equal(result[0].emoji, ':foooo:');
	});

	test('一致種別の優先順位とDB内の順序を維持する', () => {
		const result = searchEmoji('foo', [
			{ name: 'xfoo', emoji: '部分一致' },
			{ name: 'foo-alias', emoji: '前方一致エイリアス', aliasOf: 'original' },
			{ name: 'foobar', emoji: '前方一致' },
			{ name: 'foo', emoji: '完全一致エイリアス', aliasOf: 'another' },
			{ name: 'foo', emoji: '完全一致' },
		]);

		assert.deepEqual(
			result.map((x) => x.emoji),
			['完全一致', '完全一致エイリアス', '前方一致', '前方一致エイリアス', '部分一致'],
		);
	});

	test('maxを超えずaliasOf単位で重複を除外する', () => {
		const result = searchEmoji(
			'foo',
			[
				{ name: 'foo-a', emoji: 'A', aliasOf: 'same' },
				{ name: 'foo-b', emoji: 'B', aliasOf: 'same' },
				{ name: 'foo-c', emoji: 'C' },
			],
			2,
		);

		assert.deepEqual(
			result.map((x) => x.emoji),
			['C', 'A'],
		);
	});

	test('通常一致の検索ではDBを1回だけ走査する', () => {
		let nameReads = 0;
		const emojiDb = Array.from({ length: 500 }, (_, index) => ({
			emoji: `:${index}:`,
			get name() {
				nameReads++;
				return `emoji-${index}`;
			},
		}));

		searchEmoji('zzz', emojiDb);

		assert.equal(nameReads, emojiDb.length);
	});
});
