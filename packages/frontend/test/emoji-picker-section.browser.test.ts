/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import MkEmojiPickerSection from '@/features/emoji-picker/components/MkEmojiPicker.Section.vue';

vi.mock('@/features/custom-emoji/custom-emojis.js', async () => {
	// mock factory は静的 import より先に実行されるため、Vue の初期化をここで待つ。
	const { computed } = await import('vue');
	return {
		customEmojisByCategory: computed(() => ({
			byCategory: new Map([['x/sub', [{ name: 'c' }, { name: 'd' }]]]),
			uncategorized: [],
		})),
	};
});

afterEach(() => {
	cleanup();
});

function disabledEmojis(container: Element): string[] {
	return [...container.querySelectorAll('button[data-emoji]')]
		.filter((button) => (button as HTMLButtonElement).disabled)
		.map((button) => (button as HTMLElement).dataset['emoji'] ?? '')
		.sort();
}

describe('MkEmojiPicker.Section', () => {
	test('リアクションできない絵文字を、入れ子のフォルダでも開いたときに無効にする', async () => {
		const isDisabled = vi.fn((emoji: string) => emoji === ':b:' || emoji === ':c:');
		const result = render(MkEmojiPickerSection, {
			props: {
				emojis: [':a:', ':b:'],
				hasChildSection: true,
				customEmojiTree: [{ value: 'sub', category: 'x/sub', children: [] }],
				isDisabled,
			},
			slots: { default: 'x' },
			global: { directives: { panel: {} }, stubs: { MkCustomEmoji: true, MkEmoji: true } },
		});

		// 閉じている間は判定しない。
		expect(isDisabled).not.toHaveBeenCalled();

		const [header] = result.container.querySelectorAll('header');
		await fireEvent.click(header!);
		expect(disabledEmojis(result.container)).toEqual([':b:']);

		const childHeader = [...result.container.querySelectorAll('header')].find((h) => h.textContent?.includes('sub'));
		await fireEvent.click(childHeader!);
		expect(disabledEmojis(result.container)).toEqual([':b:', ':c:']);
	});
});
