/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, render } from '@testing-library/vue';
import { afterEach, assert, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import { searchEmoji } from '@/utility/search-emoji.js';
import { trailingMentionCandidate } from '@/features/autocomplete/mention-candidate.js';

describe('emoji autocomplete', () => {
	test('名前の部分一致はタグの部分一致より優先される', async () => {
		const result = searchEmoji('oooo', [
			{ emoji: ':foooo:', name: 'foooo' },
			{ emoji: ':baaar:', name: 'foooo', aliasOf: 'baaar' },
		]);
		assert.equal(result[0]?.emoji, ':foooo:');
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

describe('mention candidate', () => {
	test('行末に続くメンション用の文字だけを返す', () => {
		for (const text of [
			'',
			'abc',
			'hello @alice',
			'hi @a.b@c-d.example',
			'x @alice ',
			'日本語@bob_1',
			'@',
			'a b.c-d_e',
		]) {
			assert.equal(trailingMentionCandidate(text), text.match(/[a-zA-Z0-9_@.\-]+$/)?.[0] ?? '');
		}
	});

	// 非固定の正規表現では 3,000 字で 6.3 ms、6,000 字で 25 ms かかる (実測)。
	test('行の長さに比例した時間で終わる', () => {
		const text = 'a'.repeat(200_000) + ' ';
		const start = performance.now();
		assert.equal(trailingMentionCandidate(text), '');
		assert.isBelow(performance.now() - start, 50);
	});
});

const pending = new Map<string, (users: unknown[]) => void>();
vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(
		(endpoint: string, params: { username: string }) =>
			new Promise((resolve) => {
				if (endpoint === 'users/search-by-username-and-host') pending.set(params.username, resolve);
			}),
	),
}));
vi.mock('@/i.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/i.js')>()),
	$i: { id: 'me', policies: { chatAvailability: 'available' } },
}));

const user = (username: string) => ({
	id: username,
	username,
	host: null,
	name: null,
	avatarUrl: '',
	avatarBlurhash: null,
	avatarDecorations: [],
	emojis: {},
	onlineStatus: 'unknown',
	badgeRoles: [],
});

afterEach(() => {
	cleanup();
	pending.clear();
	sessionStorage.clear();
});

describe('MkAutocomplete', () => {
	test('後から届いた古い検索結果で、今の入力の候補を上書きしない', async () => {
		const MkAutocomplete = (await import('@/features/autocomplete/components/MkAutocomplete.vue')).default;
		const textarea = document.createElement('textarea');
		document.body.appendChild(textarea);
		const props = { type: 'user' as const, q: 'al', textarea, close: () => {}, x: 0, y: 0 };
		const { rerender, container } = render(MkAutocomplete, { props });
		await vi.waitFor(() => expect(pending.has('al')).toBe(true));

		await rerender({ ...props, q: 'ali' });
		await vi.waitFor(() => expect(pending.has('ali')).toBe(true));
		pending.get('ali')!([user('alice')]);
		await nextTick();
		pending.get('al')!([user('alex')]);
		await nextTick();
		await nextTick();

		expect(container.textContent).toContain('@alice');
		expect(container.textContent).not.toContain('@alex');
		expect(sessionStorage.getItem('autocomplete:user:me:al')).toBeNull();
	});
});
